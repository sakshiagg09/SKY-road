//srv/tracking.cds
using shipmentDetails from '../db/schema';
using reasonCode from '../db/schema';
using updatePOD from '../db/schema';
using unplannedEvent from '../db/schema';
using eventsReporting from '../db/schema';
using Items from '../db/schema';

service GTT {
    entity trackingDetails as projection on shipmentDetails;
    entity updatesPOD       as projection on updatePOD;
    entity reasonCodes     as projection on reasonCode;
    entity unplannedEvents as projection on unplannedEvent;
    entity eventReporting  as projection on eventsReporting;
    entity shipmentItems   as projection on Items;

}
