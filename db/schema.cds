@cds.persistence.skip
entity shipmentDetails {
    key FoId           : String; // shipment / FO id
        FinalInfo      : String;
        DirectionsInfo : String;
        StopInfo       : String;

}

@cds.persistence.skip
entity eventsReporting {
    key FoId       : String;
        Action     : String; // e.g. "DEPT" or "ARRV"
        StopId     : String;
        EventTime  : String; // optional ISO string or SAP datetime format
        TimeZone   : String;
        EventLong  : Double;
        EventLat   : Double;
        reasonCode : String;
        quantity   : Decimal(15, 3);
        signature  : String;
        podImage   : String;
}

@cds.persistence.skip
entity updatePOD {
    key FoId        : String;
        Discrepency : String;
        StopId      : String;
}

@cds.persistence.skip
entity shipmentItems {
    key itemNo    : String;
    key ordinalNo : Association to shipmentDetails;
        dispQty   : Int16;
        rcvQty    : Int16;
        productId : String;
        itemDesc  : String;
        uom       : String;
        category  : String;
        isEdited  : Boolean;
}

@cds.persistence.skip
entity Items {
    key itemNo     : String;
        FoId       : String;
        locationId : String;
        dispQty    : Int16;
        rcvQty     : Int16;
        productId  : String;
        itemDesc   : String;
        uom        : String;
        category   : String;
        isEdited   : Boolean;
}

@cds.persistence.skip
entity unplannedEvent {
    key eventCode : String;
        eventName : String;
}

@cds.persistence.skip
entity reasonCode {
    key code : String;
        name : String;
}
