@cds.persistence.skip
entity shipmentDetails {
    key ordinalNo           : Int32;
        shipmentNo          : String;
        stopId              : Int16;
        locationId          : String;
        longitude           : Double;
        latitude            : Double;
        locationAltKey      : String;
        altKey              : String;
        locationDescription : String;
        addressDetail       : String;
        materialLoad        : String;
        materialUnload      : String;
        plannedDepTime      : String;
        timeZone            : String;
        isDeparted          : Boolean;
        isArrived           : Boolean;
        isDelivered         : Boolean;
        plannedDistance     : Double;
        plannedDistanceUom  : String;
        Items               : Composition of many shipmentItems
                                  on Items.ordinalNo = $self;
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
    key itemNo      : String;
        FoId        : String;
        locationId  : String;
        dispQty     : Int16;
        rcvQty      : Int16;
        productId   : String;
        itemDesc    : String;
        uom         : String;
        category    : String;
        isEdited    : Boolean;
}
@cds.persistence.skip
entity unplannedEvent {
    key eventCode      : String;
        eventName      : String;
}
@cds.persistence.skip
entity reasonCode {
    key code      : String;
        name      : String;
}