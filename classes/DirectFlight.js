const Amadeus = require("amadeus");
const moment = require("moment-timezone");

// Load environment variables
require("dotenv").config();

// Initialize Amadeus client
const amadeus = new Amadeus({
  clientId: process.env.AMADEUS_API_KEY,
  clientSecret: process.env.AMADEUS_API_SECRET,
});

// Hardcoded buffer times for each IATA code (in hours)
const bufferHours = {
  SAN: 2, TIJ: 2, BCN: 2, ORY: 2, KUL: 2,
  SCL: 0.5, PUQ: 1.5, PTY: 2, LIS: 2, SFO: 2,
  MIA: 2, JFK: 2, LAX: 2, YYZ: 2.8, DFW: 1.7,
  MAD: 2, LHR: 2.1, CDG: 1.8, FRA: 2.5, AMS: 2.0,
  CMN: 2, JNB: 2.7, LOS: 1.9, CAI: 2, ADD: 1.5,
  DOH: 1.5, DXB: 2, DEL: 1.6, SIN: 2.3, HND: 2.0,
  PER: 2, SYD: 2.8, MEL: 1.9, BNE: 2.5, ADL: 1.7,
};

// Extra travel time added to each itinerary total travel time (in hours)
const EXTRA_TRAVEL_TIME = moment.duration(2.5, "hours");

class DirectFlight {
  // Parse duration string (e.g., "PT2H30M") into a moment.duration object
  parseDuration(durationStr) {
    const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
    const hours = match[1] ? parseInt(match[1]) : 0;
    const minutes = match[2] ? parseInt(match[2]) : 0;
    return moment.duration({ hours, minutes });
  }

  // Fetch the earliest direct flight between two destinations
  async getEarliestDirectFlight(origin, destination, minDepartureTime) {
    try {
      const response = await amadeus.shopping.flightOffersSearch.get({
        originLocationCode: origin,
        destinationLocationCode: destination,
        departureDate: minDepartureTime.format("YYYY-MM-DD"),
        adults: 1,
        currencyCode: "USD",
        max: 100,
      });

      const flights = response.data;
      if (!flights || flights.length === 0) {
        return null;
      }

      const validFlights = [];
      for (const flight of flights) {
        const segments = flight.itineraries[0].segments;
        // Skip flights with more than one segment or stops within a segment
        if (segments.length > 1 || segments[0].numberOfStops > 0) {
          continue;
        }

        const flightDetails = segments[0];
        const departureTime = moment.utc(flightDetails.departure.at);
        const cost = parseFloat(flight.price.total);

        if (departureTime.isSameOrAfter(minDepartureTime)) {
          validFlights.push({ flight, cost });
        }
      }

      if (validFlights.length === 0) {
        return null;
      }

      // Sort by departure time and pick the earliest flight
      validFlights.sort((a, b) => moment.utc(a.flight.itineraries[0].segments[0].departure.at).diff(moment.utc(b.flight.itineraries[0].segments[0].departure.at)));

      const earliestFlight = validFlights[0].flight;
      const flightDetails = earliestFlight.itineraries[0].segments[0];

      const departureTime = moment.utc(flightDetails.departure.at);
      const arrivalTime = moment.utc(flightDetails.arrival.at);
      const duration = this.parseDuration(flightDetails.duration);

      return {
        airline: earliestFlight.validatingAirlineCodes[0],
        flightNumber: flightDetails.carrierCode + flightDetails.number,
        departureTime,
        arrivalTime,
        origin,
        destination,
        duration,
        cost: validFlights[0].cost,
      };
    } catch (error) {
      console.error(`Error fetching flights: ${JSON.stringify(error)}`);
      return null;
    }
  }

  // Simulate an itinerary for a given sequence of destinations
  async simulateItinerary(startOrigin, sequence, startTime) {
    let origin = startOrigin;
    const flights = [];
    let totalFlightDuration = moment.duration();
    let totalLayoverDuration = moment.duration();
    let totalCost = 0.0;
    let previousArrivalTime = startTime;
    let previousDestination = origin;

    for (const destination of sequence) {
      const flight = await this.getEarliestDirectFlight(
        origin,
        destination,
        previousArrivalTime.clone().add(bufferHours[origin], "hours")
      );

      if (!flight) {
        return null; // Itinerary not possible for this sequence
      }

      const layoverDuration = moment.duration(
        flight.departureTime.diff(previousArrivalTime)
      );

      totalLayoverDuration.add(layoverDuration);
      flights.push({
        ...flight,
        layover: layoverDuration,
        layoverIata: previousDestination,
      });

      totalFlightDuration.add(flight.duration);
      totalCost += flight.cost;
      previousArrivalTime = flight.arrivalTime;
      origin = destination;
      previousDestination = destination;
    }

    const totalTravelTime = moment.duration(totalFlightDuration)
      .add(totalLayoverDuration)
      .add(EXTRA_TRAVEL_TIME);

    return {
      flights,
      totalFlightDuration,
      totalLayoverDuration,
      totalTravelTime,
      totalCost,
    };
  }
}

module.exports = { DirectFlight };