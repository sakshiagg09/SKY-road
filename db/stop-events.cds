namespace com.example.sky.db;

/*
  CDS mapping to the HDI table COM_EXAMPLE_SKY_STOP_EVENTS.
  We use cds.persistence.table annotation so CAP projects the CDS entity
  onto the HDI table (which is created by the .hdbtable artifact).
*/
entity COM_EXAMPLE_SKY_STOP_EVENTS @(cds.persistence.table: 'COM_EXAMPLE_SKY_STOP_EVENTS') {
  STOPTYPE    : String(4);     // 'F' | 'I' | 'L'
  EVENT_CODE  : String(64);
  EVENT_LABEL : String(255);
  SORT_ORDER  : Integer;
  ACTIVE      : Integer;       // stored as SMALLINT in HANA, map to Integer in CDS
}
