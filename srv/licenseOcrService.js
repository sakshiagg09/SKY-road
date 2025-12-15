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

    console.log(
      "🚀 LicenseOCRService initialized (license-only, entity-first mode)."
    );
  }

  // ---------- Basic preprocess ----------
  async preprocessImage(imageBuffer) {
    try {
      let img = sharp(imageBuffer, { limitInputPixels: 2073600 }).rotate();
      img = img.resize({ width: 1200, withoutEnlargement: true });

      const stats = await img.stats();
      const avg =
        (stats.channels[0].mean +
          stats.channels[1].mean +
          stats.channels[2].mean) /
        3;

      img = img.grayscale().normalize();

      if (avg < 60) {
        img = img.gamma(1.4);
      } else if (avg > 190) {
        img = img.modulate({ brightness: 0.8 });
      }

      try {
        if (typeof img.clahe === "function") {
          img = img.clahe({ width: 64, height: 64, maxSlope: 3 });
        }
      } catch (e) {
        // ignore if not supported
      }

      img = img.median(1).sharpen(1.5, 0.5);
      return await img.jpeg({ quality: 75, mozjpeg: true }).toBuffer();
    } catch (err) {
      console.error("preprocessImage failed:", err);
      return imageBuffer;
    }
  }

  async processWithProcessor(imageBuffer, processorId) {
    const base64Doc = imageBuffer.toString("base64");
    const name = `projects/${this.projectId}/locations/${this.location}/processors/${processorId}`;

    const request = {
      name,
      rawDocument: { content: base64Doc, mimeType: "image/jpeg" },
    };

    const [result] = await this.client.processDocument(request);
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
      const doc = await this.processWithProcessor(
        processed,
        this.licenseProcessor
      );

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
        const m =
          txt.match(/\b[A-Z0-9]{5,20}\b/) ||
          txt.match(/\b\d{8,16}\b/);
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
