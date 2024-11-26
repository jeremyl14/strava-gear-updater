const axios = require('axios');

// Function to get athlete activities
async function getAthleteActivities(accessToken, before, after, page, perPage) {
    try {
        const response = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
            params: {
                before: before || undefined,
                after: after || undefined,
                page: page || 1,
                per_page: perPage || 30,
            },
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching activities:', error.response ? error.response.data : error.message);
    }
}

// Function to process activities
async function processActivities(accessToken) {
    try {
        // Get the latest 90 activities and filter for commute activities
        var commuteActivities = await getAthleteActivities(accessToken, null, null, 1, 200);
        if (!commuteActivities || !Array.isArray(commuteActivities) || commuteActivities.length === 0) {
            console.log('No activities fetched (token may be invalid or no activities found)');
            return;
        }
        console.log('newsest activity date:', commuteActivities[0].start_date);
        console.log('oldest activity date:', commuteActivities[commuteActivities.length - 1].start_date);
        commuteActivities = commuteActivities.filter(activity => activity.commute === true);

        const gearIdCounts = countGearIds(commuteActivities);
        const gearIds = Object.keys(gearIdCounts);
        const gearDetails = [];
        
        for (const gearId of gearIds) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            const tempName = await getGearDetails(accessToken, gearId);
            gearDetails.push({
                gearId: gearId,
                name: tempName ? tempName.name : 'Blank',
                odo: tempName ? tempName.converted_distance : 0
            });
        }
        
        const gearInfo = gearIds.map(gearId => ({
            gearId: gearId === 'null' ? null : gearId,
            name: gearDetails.find(g => g.gearId === gearId)?.name || 'Unknown',
            odo: gearDetails.find(g => g.gearId === gearId)?.odo || 0,
            count: gearIdCounts[gearId]
        }));

        // if commuteActivities is empty, print a message and return
        if (commuteActivities.length === 0) {
            console.log('No commute activities found');
            return;
        }

        // sum the activity distance for each gear using commuteActivities[i].distance
        for (const activity of commuteActivities) {
            const gearId = activity.gear_id;
            const gear = gearInfo.find(g => g.gearId === gearId);
            if (gear) {
                gear.totalDistance = (gear.totalDistance || 0) + activity.distance;
            }
        }
        //print a nice string with a summary of the gear info
        gearInfo.forEach(gear => {
            console.log(`Gear: ${gear.name} (id: ${gear.gearId}) has been used ${gear.count} times with a total distance of ${(gear.totalDistance / 1000).toFixed(1)} km`);
        });
        // print the date of the oldest activity
        console.log(`Oldest activity date: ${commuteActivities[commuteActivities.length - 1].start_date}`);

        // find the gear_id for name 'Jack', to update to new gear
        const gearIdToCheck = gearInfo.find(g => g.name === 'Jack')?.gearId || null;
        // find the gear_id for name 'Other'
        const gearIdToSet = gearInfo.find(g => g.name === 'Other')?.gearId || 'none';

        // show summary of top 5 activities using gearIdToCheck, ranked by distance
        if (gearIdToCheck !== null) {
            const topActivities = commuteActivities.filter(activity => activity.gear_id === gearIdToCheck)
            .sort((a, b) => b.distance - a.distance)
            .slice(0, 5);
            topActivities.forEach((activity, index) => {
            console.log(`Top ${index + 1} activity: ${activity.name} (id: ${activity.id}) on ${activity.start_date} with distance ${(activity.distance / 1000).toFixed(1)} km`);
            });
        } else {
            console.log('No gear with the specified name found.');
        }

        // call function to get activities to update
        const activitiesToUpdate = getUpdatableActivities(commuteActivities, gearIdToCheck, gearIdToSet);
        if (activitiesToUpdate === null) {
            console.log('No activities to update');
            return;
        }
        // keep only with id 
        // activitiesToUpdate = activitiesToUpdate.filter(activity => activity.id === );

        // double check that each activity id in activitiesToUpdate has the commute flag set to true
        let allCommuteFlagsTrue = true;
        for (const activity of activitiesToUpdate) {
            const response = await axios.get(`https://www.strava.com/api/v3/activities/${activity.id}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
            });
            if (response.data.commute !== true || response.data.distance > 10000) {
            console.error(`Activity ${activity.id} is not a commute or distance is too long`);
            allCommuteFlagsTrue = false;
            }
        }
        if (allCommuteFlagsTrue) {
            console.log('All tests pass, proceeding');

            //update activities
            for (const activity of activitiesToUpdate) {
                const response = await axios.put(`https://www.strava.com/api/v3/activities/${activity.id}`, {
                    gear_id: activity.gear_id,
                    name: activity.name
                }, {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                    }
                });
                console.log('Activity updated:', activity.id);
            }
        }
        else {
            console.error('One or more tests failed. No updates made.');
        }

    } catch (error) {
        console.error('Error processing activities:', error);
        }
}

// Function to count gear IDs in the commute activities
function countGearIds(commuteActivities) {
    const gearIdCounts = {};

    commuteActivities.forEach(activity => {
        const gearId = activity.gear_id;
        if (gearId === null) {
            gearIdCounts[null] = (gearIdCounts[null] || 0) + 1;
        } else if (gearId) {
            gearIdCounts[gearId] = (gearIdCounts[gearId] || 0) + 1;
        }
    });

    return gearIdCounts;
}

// Function to get gear details by gear_id
async function getGearDetails(accessToken, gearId) {
    if (!gearId) {
        throw new Error('gearId is required');
    }
    // if gearId is null, return null
    if (gearId === 'null') {
        // return null and 0 for odo
        return null;
    }
    try {
        const response = await axios.get(`https://www.strava.com/api/v3/gear/${gearId}`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
            }
        });
        return response.data;
    } catch (error) {
        console.error('Error fetching gear details:', gearId, error.response ? error.response.data : error.message);
    }
}

// function taking commuteactivities and returning array of updatable activities
function getUpdatableActivities(commuteActivities, gearIdToCheck, gearIdToSet) {
    activitiesToUpdate = [];
    // if gearIdToCheck is null, return empty array
    if (gearIdToCheck === null) {
        return null;
    }
    for (const activity of commuteActivities) {
        // check if gear_id is gearIdToCheck
        if (activity.gear_id === gearIdToCheck) {
            // get name of activity
            var activityName = activity.name;
            // string replace "Ride" with "Commute"
            activityName = activityName.replace("Ride", "Commute");

            // add updatableactivity to activitiesToUpdate
            activitiesToUpdate.push({
                id: activity.id,
                gear_id: gearIdToSet,
                name: activityName
            });
        }
    }

    console.log('Activities to update:', activitiesToUpdate);
    return activitiesToUpdate;
}

// Export the necessary functions
module.exports = {
    processActivities,
    getAthleteActivities,
    getGearDetails,
    countGearIds
};

/*

Update Activity (updateActivityById)
Updates the given activity that is owned by the authenticated athlete. Requires activity:write. Also requires activity:read_all in order to update Only Me activities
put
/activities/{id}
Parameters
id
required Long, in path 	The identifier of the activity.
<Parameter Name>
UpdatableActivity, in body 	An instance of UpdatableActivity. 

UpdatableActivity
commute
boolean 	Whether this activity is a commute
trainer
boolean 	Whether this activity was recorded on a training machine
hide_from_home
boolean 	Whether this activity is muted
description
string 	The description of the activity
name
string 	The name of the activity
type
ActivityType 	Deprecated. Prefer to use sport_type. In a request where both type and sport_type are present, this field will be ignored
sport_type
SportType 	An instance of SportType.
gear_id
string 	Identifier for the gear associated with the activity. ‘none’ clears gear from activity 


Get Activity (getActivityById)
Returns the given activity that is owned by the authenticated athlete. Requires activity:read for Everyone and Followers activities. Requires activity:read_all for Only Me activities.
get
/activities/{id}
Parameters
id
required Long, in path 	The identifier of the activity.
include_all_efforts
Boolean, in query 	To include all segments efforts. 

DetailedActivity
id
long 	The unique identifier of the activity
external_id
string 	The identifier provided at upload time
upload_id
long 	The identifier of the upload that resulted in this activity
athlete
MetaAthlete 	An instance of MetaAthlete.
name
string 	The name of the activity
distance
float 	The activity's distance, in meters
moving_time
integer 	The activity's moving time, in seconds
elapsed_time
integer 	The activity's elapsed time, in seconds
total_elevation_gain
float 	The activity's total elevation gain.
elev_high
float 	The activity's highest elevation, in meters
elev_low
float 	The activity's lowest elevation, in meters
type
ActivityType 	Deprecated. Prefer to use sport_type
sport_type
SportType 	An instance of SportType.
start_date
DateTime 	The time at which the activity was started.
start_date_local
DateTime 	The time at which the activity was started in the local timezone.
timezone
string 	The timezone of the activity
start_latlng
LatLng 	An instance of LatLng.
end_latlng
LatLng 	An instance of LatLng.
achievement_count
integer 	The number of achievements gained during this activity
kudos_count
integer 	The number of kudos given for this activity
comment_count
integer 	The number of comments for this activity
athlete_count
integer 	The number of athletes for taking part in a group activity
photo_count
integer 	The number of Instagram photos for this activity
total_photo_count
integer 	The number of Instagram and Strava photos for this activity
map
PolylineMap 	An instance of PolylineMap.
trainer
boolean 	Whether this activity was recorded on a training machine
commute
boolean 	Whether this activity is a commute
manual
boolean 	Whether this activity was created manually
private
boolean 	Whether this activity is private
flagged
boolean 	Whether this activity is flagged
workout_type
integer 	The activity's workout type
upload_id_str
string 	The unique identifier of the upload in string format
average_speed
float 	The activity's average speed, in meters per second
max_speed
float 	The activity's max speed, in meters per second
has_kudoed
boolean 	Whether the logged-in athlete has kudoed this activity
hide_from_home
boolean 	Whether the activity is muted
gear_id
string 	The id of the gear for the activity
kilojoules
float 	The total work done in kilojoules during this activity. Rides only
average_watts
float 	Average power output in watts during this activity. Rides only
device_watts
boolean 	Whether the watts are from a power meter, false if estimated
max_watts
integer 	Rides with power meter data only
weighted_average_watts
integer 	Similar to Normalized Power. Rides with power meter data only
description
string 	The description of the activity
photos
PhotosSummary 	An instance of PhotosSummary.
gear
SummaryGear 	An instance of SummaryGear.
calories
float 	The number of kilocalories consumed during this activity
segment_efforts
DetailedSegmentEffort 	A collection of DetailedSegmentEffort objects.
device_name
string 	The name of the device used to record the activity
embed_token
string 	The token used to embed a Strava activity
splits_metric
Split 	The splits of this activity in metric units (for runs)
splits_standard
Split 	The splits of this activity in imperial units (for runs)
laps
Lap 	A collection of Lap objects.
best_efforts
DetailedSegmentEffort 	A collection of DetailedSegmentEffort objects. 
*/