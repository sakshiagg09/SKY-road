using { sky.db.Items as Items } from '../db/schema';

service GTT {

  // ----- NON-PERSISTENT (virtual) entities used for remote calls / passthrough
  @cds.persistence.skip
  entity shipmentDetails {
    key FoId           : String;
        FinalInfo      : String;
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

  // ----- SERVICE ENTITIES
  entity trackingDetails as projection on shipmentDetails;
  entity updatesPOD      as projection on updatePOD;
  entity unplannedEvents as projection on unplannedEvent;
  entity eventReporting  as projection on eventsReporting;

  // Persisted table exposed as service entity
  entity shipmentItems   as projection on Items;

}