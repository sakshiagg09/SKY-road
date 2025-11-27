
const cds = require("@sap/cds");
const axios = require("axios");
const DestinationAccessor = require("@sap-cloud-sdk/connectivity/dist/scp-cf/destination");
const { log } = require("console");

module.exports = cds.service.impl(async function () {
    const {
        trackingDetails,
        trackingItems,
        unplannedEvents,
        reasonCodes
    } = this.entities;
    this.on('READ', trackingDetails, getTrackingDetails);
    this.on('READ', trackingItems, getTrackingItems);
    this.on('READ', unplannedEvents, getunplannedEvents);
    this.on('READ', reasonCodes, getreasonCodes);
    this.on('UPDATE', trackingDetails, updateStatus);
    this.on("updateStatus", updateStatus);
    this.on("updateDelivery", updateDelivery);
})

const getTrackingDetails = async (req) => {
  try {
    // 1) Get the FO ID (tracking id) from the query
    const foId = req.query.SELECT.where[2].val; // same as you had before

    // 2) Connect to S/4 via destination "sky_app"
    const s4 = await cds.connect.to('SKY_APP');

    // 3) Call the S/4 OData entity that returns the fields you listed
    //    Replace "/YourEntitySet" and "FOID" with your real entity set + key field.
    const s4Response = await s4.send({
      method: 'GET',
      path: '/SearchFOSet',   // e.g. '/Z_FO_LOCSet' or similar
      query: {
        $filter: `FOID eq '${foId}'`,
        $format: 'json'
      }
    });

    // 4) Standard SAP GW style: { d: { results: [...] } }
    const results = s4Response?.d?.results || [];

    // Option A: simply return what S/4 gave you (FOID, LOCATION_ID, etc.)
    return results;

    // Option B (if later you want to map to different field names):
    /*
    return results.map(r => ({
      FoId: r.FOID,
      LocationId: r.LOCATION_ID,
      SourceStop: r.SOURCE_STOP,
      IntermediateStop: r.INTERMEDIATE_STOP,
      DestinationStop: r.DESTINATION_STOP,
      Longitude: r.LONGITUDE,
      Latitude: r.LATITUDE,
      LocationName: r.LOCATION_NAME,
      Street: r.STREET,
      PostalCode: r.POSTAL_CODE,
      City: r.CITY,
      Region: r.REGION,
      Country: r.COUNTRY
    }));
    */
  } catch (error) {
    console.error('Error in getTrackingDetails:', error);
    return { apiResponse: error.message };
  }
};

/*const getTrackingDetails = async (req, res) => {
    try {
        
        var gttAPI = process.env.gttURL + '/Shipment?$filter=trackingId eq ' + "'" + req.query.SELECT.where[2].val + "'";
        let res = await axios({
            method: 'GET',
            url: gttAPI,
            headers: {
                Authorization: 'Basic dmFpYmhhdi5zdXJ5YXdhbnNoaUBuYXYtaXQuY29tOk5hdkA1MzEyMQ==', //process.env.gttAuth,
                Accept: "application/json"
            },
            params: {
                $expand: 'stops,plannedEvents,freightUnitTPs,freightUnitTPs/freightUnit,freightUnitTPs/freightUnit/freightUnitItems',
                $format: 'json'
            }
        });
        var s4items = process.env.itemDest + '/itemDataSet?$filter=FoId eq ' + "'" + req.query.SELECT.where[2].val + "'";
        let itemRes = await axios({
            method: 'GET',
            url: s4items,
            headers: {
                Authorization: process.env.itemAuth,
                Accept: "application/json"
            },
            params: {
                $format: 'json'
            }
        });
        var trackingDetails = [];
        const depart = 'com.navgtt014vifgdob.gtt.app.gttft1.Shipment.Departure';
        const arrive = 'com.navgtt014vifgdob.gtt.app.gttft1.Shipment.Arrival';
        const pod = 'com.navgtt014vifgdob.gtt.app.gttft1.Shipment.POD';
        const eventReported = 'REPORTED';
        const eventLateReported = 'LATE_REPORTED';
        const eventEarlyReported = 'EARLY_REPORTED';
        for (i = 0; i < res.data.d.results[0].stops.results.length; i++) {
            var lbnAPI = process.env.lbnURL + '/Location?$filter=externalId eq ' + "'" + res.data.d.results[0].stops.results[i].locationId + "'";
            let reslbn = await axios({
                method: 'GET',
                url: lbnAPI,
                headers: {
                    Authorization: process.env.lbnAuth,
                    Accept: "application/json"
                },
                params: {
                    $format: 'json'
                }
            });
            var resobj = {};
            let plannedEvent;
            if( res.data.d.results[0].plannedEvents.results &&  reslbn.data.d.results[0] && res.data.d.results[0].plannedEvents.results.filter(obj => obj.locationAltKey === reslbn.data.d.results[0].locationAltKey))
            {

                plannedEvent = res.data.d.results[0].plannedEvents.results.filter(obj => obj.locationAltKey === reslbn.data.d.results[0].locationAltKey);
                if (plannedEvent.filter(obj => obj.eventType === depart) && ((plannedEvent.find(obj => obj.eventStatus_code === eventReported)) || (plannedEvent.find(obj => obj.eventStatus_code === eventEarlyReported)) || (plannedEvent.find(obj => obj.eventStatus_code === eventLateReported))))
                    resobj.isDeparted = 'X';
                let plannedArrive = plannedEvent.filter(obj => obj.eventType === arrive);
                if (plannedArrive.length > 0) {
                    resobj.plannedDepTime = (new Date(parseInt(plannedArrive[0].plannedBusinessTimestamp.match(/(\d+)/)[0])).toLocaleString('en-UK', plannedArrive[0].plannedBusinessTimeZone)) + ' ' + plannedArrive[0].plannedBusinessTimeZone;
                    resobj.timeZone = plannedArrive[0].plannedBusinessTimeZone;
                    if ((plannedEvent.find(obj => obj.eventStatus_code === eventReported)) || (plannedEvent.find(obj => obj.eventStatus_code === eventEarlyReported)) || (plannedEvent.find(obj => obj.eventStatus_code === eventLateReported)))
                        resobj.isArrived = 'X';
                }
                if (plannedEvent.filter(obj => obj.eventType === pod) && ((plannedEvent.find(obj => obj.eventStatus_code === eventReported)) || (plannedEvent.find(obj => obj.eventStatus_code === eventEarlyReported)) || (plannedEvent.find(obj => obj.eventStatus_code === eventLateReported))))
                    resobj.isDelivered = 'X';
             }
            resobj.shipmentNo = res.data.d.results[0].shipmentNo;
            resobj.altKey = res.data.d.results[0].altKey;
            resobj.locationId = res.data.d.results[0].stops.results[i].locationId;
            resobj.ordinalNo = res.data.d.results[0].stops.results[i].ordinalNo;
            resobj.stopId = res.data.d.results[0].stops.results[i].stopId;
            resobj.locationDescription =  reslbn.data.d.results[0]? reslbn.data.d.results[0].locationDescription: null;
            resobj.addressDetail = reslbn.data.d.results[0]? reslbn.data.d.results[0].addressDetail : null;
            resobj.longitude = reslbn.data.d.results[0]? reslbn.data.d.results[0].longitude : null;
            resobj.latitude = reslbn.data.d.results[0]? reslbn.data.d.results[0].latitude : null;
            resobj.locationAltKey = reslbn.data.d.results[0]? reslbn.data.d.results[0].locationAltKey : null;
            resobj.materialLoad = '10';
            resobj.materialUnload = '0';
            //resobj.plannedDepTime = 'Jan 10, 2024, 11:10:00 AM';
            resobj.plannedDistance = res.data.d.results[0].plannedTotalDistance;
            resobj.plannedDistanceUom = res.data.d.results[0].plannedTotalDistanceUoM;
            if (i == 0) {
                resobj.isArrived = 'X';
                resobj.isDelivered = 'X';
                console.log(res.data.d.results[0].plannedDepartureDateTime);
                resobj.plannedDepTime = new Date(parseInt(res.data.d.results[0].plannedDepartureDateTime.match(/(\d+)/)[0])).toLocaleString('en-UK', res.data.d.results[0].plannedDepartureDateTimeZone) + ' ' + res.data.d.results[0].plannedDepartureDateTimeZone;
                resobj.timeZone = res.data.d.results[0].plannedDepartureDateTimeZone;
                resobj.materialLoad = res.data.d.results[0].cargoQuantity + res.data.d.results[0].quantityUoM;
            }
            let aItems = [];
            for (j = 0; j < itemRes.data.d.results.length; j++) {
                let items = {};
                if (itemRes.data.d.results[j].LocationId == resobj.locationId) {
                    items.ordinalNo = res.data.d.results[0].stops.results[i].ordinalNo;
                    items.itemNo = itemRes.data.d.results[j].ItemNo;
                    items.productId = itemRes.data.d.results[j].ProductId;
                    items.itemDesc = itemRes.data.d.results[j].ItemDescr;
                    items.dispQty = itemRes.data.d.results[j].ActQty;
                    items.rcvQty = itemRes.data.d.results[j].ActQty;
                    items.uom = itemRes.data.d.results[j].Unit;
                    items.category = itemRes.data.d.results[j].ItemCat;
                    aItems.push(items);
                }
            }
            resobj.Items = aItems;
            trackingDetails.push(resobj);
        }
        if (res?.data?.d?.results.length < 1) {
            return {
                departureLocationId: '',
                arrivalLocationId: ''
            };
        }
        return trackingDetails;
    }
    catch (error) {

        return {
            apiResponse: error?.message
        };
    }
}
const getTrackingItems = async (req, res) => {
    try {
        console.log("request payload recieved Update status:",  req);

        var s4items = process.env.itemDest + '/itemDataSet?$filter=FoId eq ' + "'" + req.query.SELECT.where[2].val + "'" + ' & LocationId eq ' + "'" + req.query.SELECT.where[6].val + "'";
        let itemRes = await axios({
            method: 'GET',
            url: s4items,
            headers: {
                Authorization: process.env.itemAuth,
                Accept: "application/json"
            },
            params: {
                $format: 'json'
            }
        });
        var trackingItems = [];
        console.log("Tracking item details:", itemRes.data.d.results);
        for (j = 0; j < itemRes.data.d.results.length; j++) {
            let items = {};
            items.FoId == itemRes.data.d.results[j].FoId
            items.LocationId == itemRes.data.d.results[j].LocationId;
            items.itemNo = itemRes.data.d.results[j].ItemNo;
            items.productId = itemRes.data.d.results[j].ProductId;
            items.itemDesc = itemRes.data.d.results[j].ItemDescr;
            items.dispQty = itemRes.data.d.results[j].ActQty;
            items.rcvQty = itemRes.data.d.results[j].ActQty;
            items.uom = itemRes.data.d.results[j].Unit;
            items.category = itemRes.data.d.results[j].ItemCat;
            trackingItems.push(items);
        }
        return trackingItems;
    }
    catch (error) {
        return {
            apiResponse: error?.message
        };
    }
}
const getunplannedEvents = async (req, res) => {

    let unplannedEvents = [];
    let unplannedEvent = {};
    unplannedEvent.eventCode = 'LocationUpdate';
    unplannedEvent.eventName = 'Location Update';
    unplannedEvents.push(unplannedEvent);
    unplannedEvent = {};
    unplannedEvent.eventCode = 'Delay';
    unplannedEvent.eventName = 'Delay';
    unplannedEvents.push(unplannedEvent);
    unplannedEvent = {};
    unplannedEvent.eventCode = 'POD';
    unplannedEvent.eventName = 'Proof of Delivery';
    unplannedEvents.push(unplannedEvent);
    unplannedEvent = {};
    unplannedEvent.eventCode = 'Handover';
    unplannedEvent.eventName = 'Handover';
    unplannedEvents.push(unplannedEvent);
    unplannedEvent = {};
    unplannedEvent.eventCode = 'Return';
    unplannedEvent.eventName = 'Return';
    unplannedEvents.push(unplannedEvent);
    unplannedEvent = {};
    unplannedEvent.eventCode = 'OtherEvent';
    unplannedEvent.eventName = 'Other';
    unplannedEvents.push(unplannedEvent);
    unplannedEvent = {};
    return unplannedEvents;
}
const getreasonCodes = async (req, res) => {
    try {
        var gttAPI = process.env.gttURL + '/EventReasonCode';
        let res = await axios({
            method: 'GET',
            url: gttAPI,
            headers: {
                Authorization: process.env.gttAuth,
                Accept: "application/json"
            },
            params: {
                $format: 'json'
            }
        });
        var reasonCodes = [];
        for (i = 0; i < res.data.d.results.length; i++) {
            let reasonCode = {};
            reasonCode.code = res.data.d.results[i].code;
            reasonCode.name = res.data.d.results[i].name;
            reasonCodes.push(reasonCode);
        }
        return reasonCodes;
    }
    catch (error) {
        return {
            apiResponse: error?.message
        };
    }
}
const updateStatus = async (req, res) => {
     console.log("request payload recieved Update status:", req);
    if (req.data.eventName)
        var eventName = (req.data.eventName).trim();
   // try {
        if (req.data.eventName)
            var eventName = (req.data.eventName).trim();
        gttAPI = process.env.eventURL + '/' + eventName;
        console.log("gttapi in update status:",gttAPI );
        let postData = {};
        if (req.data.signature || req.data.podImage) {
            if (req.data.signature && req.data.podImage)
                postData = {
                    altKey: req.data.altKey,
                    eventMatchKey: req.data.stopId,
                    //quantity: req.data.quantity,
                    actualTechnicalTimestamp: req.data.eventTime,
                    actualBusinessTimeZone: req.data.timeZone,
                    actualBusinessTimestamp: req.data.eventTime,
                    locationAltKey: req.data.locationAltKey,
                    longitude: parseFloat((req.data.eventLong).toFixed(9)),
                    latitude: parseFloat((req.data.eventLat).toFixed(9)),
                    attachments: [
                        {
                            fileName: "Signature.PNG",
                            fileContentBase64: req.data.signature
                        },
                        {
                            fileName: "POD.JPEG",
                            fileContentBase64: req.data.podImage
                        }
                    ]
                };
            else if (req.data.signature)
                postData = {
                    altKey: req.data.altKey,
                    eventMatchKey: req.data.stopId,
                    //quantity: req.data.quantity,
                    actualTechnicalTimestamp: req.data.eventTime,
                    actualBusinessTimeZone: req.data.timeZone,
                    actualBusinessTimestamp: req.data.eventTime,
                    locationAltKey: req.data.locationAltKey,
                    longitude: parseFloat((req.data.eventLong).toFixed(9)),
                    latitude: parseFloat((req.data.eventLat).toFixed(9)),
                    attachments: [
                        {
                            fileName: "Signature.PNG",
                            fileContentBase64: req.data.signature
                        }
                    ]
                };
            else if (req.data.podImage)
                postData = {
                    altKey: req.data.altKey,
                    //quantity: req.data.quantity,
                    eventMatchKey: req.data.stopId,
                    actualTechnicalTimestamp: req.data.eventTime,
                    actualBusinessTimeZone: req.data.timeZone,
                    actualBusinessTimestamp: req.data.eventTime,
                    locationAltKey: req.data.locationAltKey,
                    longitude: parseFloat((req.data.eventLong).toFixed(9)),
                    latitude: parseFloat((req.data.eventLat).toFixed(9)),
                    attachments: [

                        {
                            fileName: "POD.JPEG",
                            fileContentBase64: req.data.podImage
                        }
                    ]
                };
                console.log("request post data in update status for image or signature:",postData );    
            let res = await axios({
                method: 'POST',
                url: gttAPI,
                headers: {
                    Authorization: process.env.gttAuth,
                    'Content-Type': 'application/json',
                    'LBN-GTT-Input-Data-Attachments-Flag': 'true'
                },
                data: postData
            });
        }
        else if (req.data.reasonCode) {
            postData = {
                altKey: req.data.altKey,
                eventMatchKey: req.data.stopId,
                actualTechnicalTimestamp: req.data.eventTime,
                actualBusinessTimeZone: req.data.timeZone,
                actualBusinessTimestamp: req.data.eventTime,
                reasonCode_code: req.data.reasonCode,
                locationAltKey: req.data.locationAltKey,
                longitude: parseFloat((req.data.eventLong).toFixed(9)),
                latitude: parseFloat((req.data.eventLat).toFixed(9)),
            }
            console.log("request post data in update status for reason codes:",postData );
        }
        else {
            postData = {
                altKey: req.data.altKey,
                eventMatchKey: req.data.stopId,
                actualTechnicalTimestamp: req.data.eventTime,
                actualBusinessTimeZone: req.data.timeZone,
                actualBusinessTimestamp: req.data.eventTime,
                locationAltKey: req.data.locationAltKey,
                longitude: parseFloat((req.data.eventLong).toFixed(9)),
                latitude: parseFloat((req.data.eventLat).toFixed(9)),
            }
            console.log("request post data in update status for events:",postData );
            let res = await axios({
                method: 'POST',
                url: gttAPI,
                headers: {
                    Authorization: process.env.gttAuth,
                    'Content-Type': 'application/json'
                },
                data: postData
            });
        }
        var strMsg = 'Event - ' + eventName + ' posted scuccessfully!';
        return { status: strMsg };
   // } catch (err) {
   /*     if( eventName == 'POD')
        {
            var strMsg = 'Event - ' + eventName + ' posted scuccessfully!';
            return { status: strMsg };
        }
        else
        {
            console.log("error - " + err);
            req.error(404, err.message);
        }
    }*/
/*}
const updateDelivery = async (req, res) => {
    try {
        // 2) Fetch CSRF token
            const payloadXSRF = 
            { "headers":  
                    { "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-CSRF-Token": "Fetch",
                    "x-sap-sac-custom-auth": true,
                    "Authorization": process.env.itemAuth
                    },
                    "method": "head",
                    "url": "/"}
            

        const tokenResp = await axios.request(process.env.itemDest, payloadXSRF);
        const csrfToken = tokenResp.headers['x-csrf-token'];
        const reqHeader = 
                {  "Accept": "application/json",
                    "Content-Type": "application/json",
                    "X-CSRF-Token": csrfToken,
                    "X-Requested-With": "XMLHttpRequest",
                    "Authorization" : process.env.itemAuth
                    }
      
        console.log("request payload recieved in update delivery:", req);
        let postData = JSON.stringify({
            "FoId": req.data.FoId,
            "LocationId": req.data.LocationId,
            "ItemNo": req.data.ItemNo,
            "ProductId": req.data.ProductId,
            "ActQty": req.data.ActQty
        });
        console.log("request post data in update delivery:",postData );
        const s4service = await cds.connect.to('S4HANA');
       
        const response = await s4service.send({
            method: 'POST',
            path: '/itemDataSet',
            data: postData,
            headers: reqHeader
        });
        console.log("request post data response in update delivery:",response );
        var strMsg = 'Updated successfully!';
        return { status: strMsg };
    } catch (err) {
       
        if (err?.message == "Error during request to remote service: Updated") {
          // Treat this as a real success
          console.log('SAP said “Updated” with success severity');
          return{ status: "Updated Successfully"};
        }
        else{
            console.log("error - " + err);
            req.error(404, err.message);
        }

    }
}*/