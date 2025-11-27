@cds.persistence.skip
entity shipmentDetails {

    // Use FOID + LOCATION_ID as the key combination
    key FOID        : String;
    key LOCATION_ID : String;

    // Stop type flags
    // If your OData returns 'X' / '' instead of true/false,
    // switch these to String(1) instead of Boolean.
    SOURCE_STOP       : Boolean;
    INTERMEDIATE_STOP : Boolean;
    DESTINATION_STOP  : Boolean;

    // Geo coordinates
    LONGITUDE   : Double;
    LATITUDE    : Double;

    // Location description
    LOCATION_NAME : String;
    STREET        : String;
    POSTAL_CODE   : String;
    CITY          : String;
    REGION        : String;
    COUNTRY       : String;
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