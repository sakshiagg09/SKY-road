// import the db model's namespace (adjust path if you moved stop-events.cds)
using com.example.sky.db as db from '../db/stop-events';

service StatusService @(path:'/odata/v4/Status') {
  // project the HDI-backed entity under the service
  entity StopEvents as projection on db.COM_EXAMPLE_SKY_STOP_EVENTS;
}