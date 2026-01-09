// srv/licenseOcrService.js
const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;
const sharp = require("sharp");

class LicenseOCRService {
  constructor() {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined;
    this.client = new DocumentProcessorServiceClient(
      credPath ? { keyFilename: credPath } : {}
    );

    // Use the same values as your working project
    this.projectId = "379357225647";
    this.location = "us";
    this.licenseProcessor = "34f5e4ad2405c0d2";

    // Tuning knobs
    this.MAX_SIDE = Number(process.env.OCR_MAX_SIDE || 1000); // resize longest edge
    this.MAX_BYTES = Number(process.env.OCR_MAX_BYTES || 350 * 1024); // ~350 KB
    this.TIMEOUT_MS = Number(process.env.OCR_TIMEOUT_MS || 20000); // 20s hard timeout

    console.log(
      "🚀 LicenseOCRService initialized (license-only, compressed upload + timeout)."
    );
  }

  // ----------------- small helpers -----------------
  _withTimeout(promise, ms, label = "operation") {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
      ),
    ]);
  }

  async _probeMeta(imageBuffer) {
    try {
      const meta = await sharp(imageBuffer, { failOn: "none" }).metadata();
      return meta || {};
    } catch {
      return {};
    }
  }

  // ----------------- FAST preprocess + compression -----------------
  /**
   * Goal: produce a small, readable JPEG buffer quickly.
   * - hard cap on size (long edge)
   * - grayscale + normalize (good OCR boost)
   * - adaptive brightness (optional)
   * - iterative quality reduction until MAX_BYTES
   */
  async preprocessImage(imageBuffer) {
    try {
      // Protect server memory (huge photos)
      const input = sharp(imageBuffer, {
        limitInputPixels: 12_000_000, // allow bigger inputs but safe
        failOn: "none",
      }).rotate();

      const meta = await input.metadata();
      const width = meta?.width || null;
      const height = meta?.height || null;

      // Resize: longest edge -> MAX_SIDE (keeps aspect)
      let img = input.resize({
        width: width && height && width >= height ? this.MAX_SIDE : null,
        height: width && height && height > width ? this.MAX_SIDE : null,
        fit: "inside",
        withoutEnlargement: true,
      });

      // Lightweight enhancement (fast)
      // (Keeping it simple is often faster overall than heavy denoise/clahe)
      img = img.grayscale().normalize().sharpen(0.8);

      // Optional exposure tweak based on rough brightness
      // (stats() costs a bit, but still cheaper than heavy filters)
      try {
        const stats = await img.stats();
        const avg =
          (stats.channels?.[0]?.mean ?? 128) +
          (stats.channels?.[1]?.mean ?? 128) +
          (stats.channels?.[2]?.mean ?? 128);
        const mean = avg / 3;

        if (mean < 60) {
          img = img.gamma(1.3);
        } else if (mean > 190) {
          img = img.modulate({ brightness: 0.85 });
        }
      } catch {
        // ignore brightness heuristics if stats fails
      }

      // Encode JPEG iteratively to meet MAX_BYTES
      // Start at good quality then step down only if needed
      const qualitySteps = [70, 60, 50, 45, 40, 35];

      let out = null;
      let chosenQ = qualitySteps[0];

      for (const q of qualitySteps) {
        chosenQ = q;
        out = await img
          .jpeg({
            quality: q,
            mozjpeg: true,
            chromaSubsampling: "4:2:0",
          })
          .toBuffer();

        if (out.length <= this.MAX_BYTES) break;
      }

      // If still too big, do one more downscale + q=40 as last resort
      if (out && out.length > this.MAX_BYTES) {
        const smallerSide = Math.max(700, Math.floor(this.MAX_SIDE * 0.85));
        const img2 = sharp(out, { failOn: "none" })
          .resize({ width: smallerSide, height: smallerSide, fit: "inside", withoutEnlargement: true })
          .grayscale()
          .normalize()
          .sharpen(0.6);

        out = await img2.jpeg({ quality: 40, mozjpeg: true }).toBuffer();
        chosenQ = 40;
      }

      // Debug: show size drop
      console.log("🗜️ OCR preprocess:", {
        inKB: Math.round(imageBuffer.length / 1024),
        outKB: out ? Math.round(out.length / 1024) : null,
        maxKB: Math.round(this.MAX_BYTES / 1024),
        maxSide: this.MAX_SIDE,
        qualityUsed: chosenQ,
      });

      return out || imageBuffer;
    } catch (err) {
      console.error("preprocessImage failed:", err);
      return imageBuffer;
    }
  }

  async processWithProcessor(imageBuffer, processorId) {
    const base64Doc = imageBuffer.toString("base64");
    const name = `projects/${this.projectId}/locations/${this.location}/processors/${processorId}`;

    // We are producing JPEG in preprocessImage
    const request = {
      name,
      rawDocument: { content: base64Doc, mimeType: "image/jpeg" },
    };

    const call = this.client.processDocument(request);
    const [result] = await this._withTimeout(call, this.TIMEOUT_MS, "Document AI processDocument");
    return result.document || {};
  }

  extractFieldsFromDoc(doc) {
    const map = {};
    const ents = doc?.entities || [];
    for (const ent of ents) {
      const text =
        ent?.mentionText ||
        (ent?.normalizedValue && ent.normalizedValue.text) ||
        "";
      if (ent?.type) {
        if (!map[ent.type]) map[ent.type] = text;
      }
    }
    return map;
  }

  _avgConfidence(doc) {
    const ents = doc?.entities || [];
    if (!ents.length) return 0.75;
    const vals = ents.map((e) =>
      typeof e.confidence === "number" && e.confidence > 0 ? e.confidence : 0.75
    );
    const sum = vals.reduce((a, b) => a + b, 0);
    return Math.max(0.5, Math.min(1, sum / vals.length));
  }

  /**
   * Public: extractLicenseNumber
   * @param {Buffer} imageBuffer
   * @returns {{ licenseNumber: string, confidence: number, rawText: string }}
   */
  async extractLicenseNumber(imageBuffer) {
    try {
      const processed = await this.preprocessImage(imageBuffer);

      // Optional: quick probe log (safe)
      const meta = await this._probeMeta(processed);
      console.log("🖼️ OCR input meta:", {
        w: meta?.width,
        h: meta?.height,
        format: meta?.format,
        sizeKB: Math.round(processed.length / 1024),
      });

      const doc = await this.processWithProcessor(processed, this.licenseProcessor);

      console.log(
        "🔍 LICENSE ENTITIES (raw):",
        JSON.stringify(doc.entities || [], null, 2)
      );

      const fields = this.extractFieldsFromDoc(doc);

      let licenseNumber =
        (fields["LicenseNumber"] ||
          fields["DLNumber"] ||
          fields["license_number"] ||
          fields["DrivingLicenseNumber"] ||
          fields["DRIVING_LICENSE_NUMBER"] ||
          "") + "";

      licenseNumber = licenseNumber.replace(/[\s\-]+/g, "").toUpperCase();

      // Fallback: any entity with reasonable alnum size
      if (!licenseNumber) {
        for (const e of doc.entities || []) {
          const norm =
            (e.normalizedValue && e.normalizedValue.text) ||
            e.mentionText ||
            "";
          const cleaned = norm
            .toString()
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, "")
            .trim();
          if (cleaned.length >= 5 && cleaned.length <= 20) {
            licenseNumber = cleaned;
            break;
          }
        }
      }

      // Last fallback: scan raw text
      if (!licenseNumber && doc.text) {
        const txt = doc.text.toUpperCase();
        const m = txt.match(/\b[A-Z0-9]{5,20}\b/) || txt.match(/\b\d{8,16}\b/);
        if (m) licenseNumber = m[0].replace(/[\s\-]+/g, "");
      }

      const result = {
        licenseNumber: licenseNumber || "",
        confidence: this._avgConfidence(doc),
        rawText: doc.text || "",
      };

      console.log("✅ extractLicenseNumber result:", result);
      return result;
    } catch (err) {
      console.error("extractLicenseNumber failed:", err);
      throw new Error(err.message || String(err));
    }
  }
}

module.exports = new LicenseOCRService();
