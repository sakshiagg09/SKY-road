using { sky.db.Items as Items } from '../db/schema';
using { sky.db.DriverLocations as DriverLocations } from '../db/schema';

service GTT {

  // ----- NON-PERSISTENT (virtual) entities used for remote calls / passthrough
  @cds.persistence.skip
  entity shipmentDetails {
    key FoId           : String;
        DriverLicense  : String;
        FinalInfo      : String;
        ReturnInfo     : String;
        Message        : String;
        DirectionsInfo : String;
        StopInfo       : String;
        Stops          : String;
  }

  @cds.persistence.skip
  entity eventsReporting {
    key FoId       : String;
        Action     : String;
        StopId     : String;
        EventTime  : String;
        TimeZone   : String;
        Longitude  : Double;
        Latitude   : Double;
        reasonCode : String;
        quantity   : Decimal(15,3);
        signature  : String;
        podImage   : String;
  }

  @cds.persistence.skip
  entity updatePOD {
    key FoId        : String;
        Discrepency : String;
        StopId      : String;
        Items       : LargeString;
        Latitude    : Double;
        Longitude   : Double;
  }

  // If you need this, define it here too (adjust fields as per your actual payload):
  @cds.persistence.skip
  entity unplannedEvent {
    key FoId      : String;
        StopId    : String;
        Action    : String;
        EventTime : String;
        Reason    : String;
        Latitude  : Double;
        Longitude : Double;
  }

    @cds.persistence.skip
  entity attachmentPayload {
    key FoId      : String;
        FileType  : String;
        PDFBase64 : LargeString;
  }
    // ✅ NEW: Attachments (READ list by FoId)
  @cds.persistence.skip
  entity attachments {
    key FoId        : String;
    key FileName    : String;

        Description : String;
        CreatedBy   : String;
        FileType    : String;
        MimeCode    : String;

        // optional (big) – return only when you really need it
        PDFBase64   : LargeString;
  }
    @cds.persistence.skip
  entity delayEvent {
  key FoId         : String;   
      StopId       : String;
      ETA          : String;
      RefEvent     : String;
      Event        : String;  
      EventCode    : String;  
      EvtReasonCode: String;   
      Description  : String;   
      Latitude     : Double;
      Longitude    : Double;
}
// ✅ NEW: ReturnItemsSet (READ by key)
  @cds.persistence.skip
  entity returnItemsPayload {
    key StopId     : String;
    key Location   : String;
    key FoId       : String;
        Latitude  : Double;
        Longitude : Double;
        LoadedItems : LargeString;  // JSON string e.g. "[{...}]"
  }

  // ✅ NEW: UnloadingSet (CREATE)
  @cds.persistence.skip
  entity unloadingPayload {
    key FoId     : String;
    key StopId   : String;
        Latitude  : Double;       // optional
        Longitude : Double;       // optional
        Event     : String;         // optional (if backend returns)
        Timestamp : String;         // optional (if backend returns)
  }


  // ----- SERVICE ENTITIES
  entity trackingDetails as projection on shipmentDetails;
  entity updatesPOD      as projection on updatePOD;
  entity unplannedEvents as projection on unplannedEvent;
  entity eventReporting  as projection on eventsReporting;

  // Persisted table exposed as service entity
  entity shipmentItems   as projection on Items;
  entity attachmentUpload  as projection on attachmentPayload;
  entity delayEvents   as projection on delayEvent;
  entity driverLocations as projection on DriverLocations;  
    // ✅ Expose ReturnItemsSet + UnloadingSet as service entities
  entity ReturnItemsSet      as projection on returnItemsPayload;
  entity UnloadingSet        as projection on unloadingPayload;
  entity AttachmentsSet      as projection on attachments;
  

    // ----- OCR ACTION (for license scanning from frontend)
  action extractLicenseNumber(
    imageBase64 : LargeString   // base64-encoded JPEG/PNG from the app
  ) returns {
    licenseNumber : String;
    confidence    : Decimal(5,4);
  };

}