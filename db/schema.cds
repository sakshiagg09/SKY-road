namespace sky.db;

using {
    cuid,
    managed
} from '@sap/cds/common';


/**
 * 1) Shipment header (one row per FoId)
 *    Keep it minimal; stop/event details go into child tables.
 */
entity Shipments : managed {
    key FoId              : String(35);

        FinalInfo         : String(5000);
        DirectionsInfo    : String(5000);
        StopInfo          : String(5000);

        // Optional quick status fields (handy for UI/search)
        LastEventTime     : Timestamp;
        LastKnownLocation : String(60);
        LastKnownStopId   : String(20);
        LastKnownEvent    : String(20);
}

/**
 * 2) Stops (one row per stop per shipment)
 *    Stores the stop master/address + geolocation.
 */
entity ShipmentStops : managed {
    key ID         : UUID; // surrogate key (easy associations)

        FoId       : String(35);
        StopId     : String(20); // e.g. "0000000020"
        StopSeqPos : String(1); // F / I / L
        Location   : String(60); // locid e.g. "SP_1000" or "1000000000"
        TypeLoc    : String(20); // Shipper / Customer

        // Address fields from payload
        AdrNummer  : String(20);
        Name1      : String(200);
        Street     : String(200);
        PostCode1  : String(20);
        City1      : String(100);
        Region     : String(20);
        Country    : String(3);

        // Base geo for stop (can also be updated per event)
        Longitude  : Double;
        Latitude   : Double;

        // Make it easy to traverse
        toShipment : Association to Shipments
                         on toShipment.FoId = FoId;

// Optional: avoid duplicates per shipment-stopid
// (CAP doesn’t enforce unique constraints in CDS universally,
//  but you can add it via DB migration if needed.)
}

/**
 * 3) Stop events (multiple per stop per shipment)
 *    This is what you “update per store / stop” over time.
 */
entity StopEvents : managed {
    key ID          : UUID;

        FoId        : String(35);
        StopId      : String(20);

        Event       : String(20); // ARRIVAL / DEPARTURE / POD etc.
        Action      : String(10); // ARRV / DEPT / POD (optional normalized code)
        EventTime   : Timestamp; // convert from 20251126230000 -> Timestamp
        TimeZone    : String(10);

        EventLong   : Double;
        EventLat    : Double;

        ReasonCode  : String(40);
        Quantity    : Decimal(15, 3);
        QuantityUom : String(10);

        Signature   : String(2000);
        PodImage    : LargeString; // base64/url/etc

        // Associations
        toShipment  : Association to Shipments
                          on toShipment.FoId = FoId;

        toStop      : Association to ShipmentStops
                          on  toStop.FoId   = FoId
                          and toStop.StopId = StopId;
}

/**
 * 4) Items / Packages (multiple per FoId+Location).
 *    NOTE: PackageId must be part of the key if you want multiple packages.
 */
entity Items : managed {
    key FoId           : String(35);
    key Location       : String(60);
    key PackageId      : String(60);

        ItemDescr      : String(255);
        ItemCat        : String(20); // PKG etc.
        Type           : String(20); // Shipper/Customer if you store that
        Quantity       : Decimal(15, 3);
        QuantityUom    : String(10);
        GrossWeight    : Decimal(15, 3);
        GrossWeightUom : String(10);

        toShipment     : Association to Shipments
                             on toShipment.FoId = FoId;
}

/**
 * 5) Stop Event Sequence Config (from your screenshot)
 *    One row per StopType + StopPos + StopEvent.
 */
entity StopEventSequenceConfig : managed {
    key StopType      : String(20); // Shipper / Customer
    key StopPos       : String(1); // F / I / L
    key StopEvent     : String(20); // Arrival / Departure / POD
        EventSequence : Integer; // 1..n

        // Optional: how you want to map to reporting action codes
        ActionCode    : String(10); // ARRV / DEPT / POD
}
