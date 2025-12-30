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
  }

  @cds.persistence.skip
  entity eventsReporting {
    key FoId       : String;
        Action     : String;
        StopId     : String;
        EventTime  : String;
        TimeZone   : String;
        EventLong  : Double;
        EventLat   : Double;
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
  }

  // If you need this, define it here too (adjust fields as per your actual payload):
  @cds.persistence.skip
  entity unplannedEvent {
    key FoId      : String;
        StopId    : String;
        Action    : String;
        EventTime : String;
        Reason    : String;
  }

    @cds.persistence.skip
  entity attachmentPayload {
    key FoId      : String;
        FileType  : String;
        PDFBase64 : LargeString;
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
  

    // ----- OCR ACTION (for license scanning from frontend)
  action extractLicenseNumber(
    imageBase64 : LargeString   // base64-encoded JPEG/PNG from the app
  ) returns {
    licenseNumber : String;
    confidence    : Decimal(5,4);
  };

}