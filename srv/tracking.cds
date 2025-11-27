using shipmentDetails from '../db/schema';
using reasonCode from '../db/schema';
using Items from '../db/schema';
using unplannedEvent from '../db/schema';

service GTT {
    entity trackingDetails as projection on shipmentDetails;
    entity trackingItems as projection on Items;
    entity reasonCodes as projection on reasonCode;
    entity unplannedEvents as projection on unplannedEvent;
    action updateStatus(altKey : String,
                        locationAltKey : String,
                        stopId : String,
                        eventName : String,
                        eventTime : String,
                        timeZone  : String,
                        reasonCode : String,
                        eventLong : Double,
                        eventLat : Double,
                        quantity : Decimal(15, 3),
                        signature : String,
                        podImage : String) returns {
        status : String
    };

    action updateDelivery(FoId : String,
                          LocationId : String,
                          ItemNo : String,
                          ProductId : String,
                          ActQty : String) returns {
        status : String
    }
}
