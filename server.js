require("dotenv").config();
const express = require("express");
const cors = require("cors");
const moment = require("moment-timezone");
const morgan = require("morgan");
const { DirectFlight } = require("./classes/DirectFlight");
const { WithStops } = require("./classes/WithStops");
const { EmailFlightData } = require("./classes/EmailFlightData");

const app = express();
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

// Hardcoded destinations
const southAmericaDestinations = ["SCL"];
const northAmericaDestinations = ["MIA", "PTY", "LAX", "SFO", "SAN", "TIJ"];
const europeDestinations = ["MAD", "LIS", "BCN", "ORY", "CMN"];
const africaDestinations = ["CMN", "CAI"];
const asiaDestinations = ["DOH", "DXB", "KUL"];
const australiaDestinations = ["PER"];

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "UP" });
});

// Fetch flights endpoint
app.get("/api/flights", async (req, res) => {
  const { start_origin, departure_date, departure_time, flight_type, email } = req.query;

  try {
    const currentTime = moment.tz(
      `${departure_date} ${departure_time}`,
      "YYYY-MM-DD HH:mm",
      "UTC"
    );

    const allSequences = cartesianProduct(
      southAmericaDestinations,
      northAmericaDestinations,
      europeDestinations,
      africaDestinations,
      asiaDestinations,
      australiaDestinations
    );

    const flightInstance = flight_type === "direct" ? new DirectFlight() : new WithStops();

    // Create an array of promises for each sequence
    const sequencePromises = allSequences.map(async (sequence) => {
      console.log(`Checking sequence: ${sequence}`);
      const itinerary = await flightInstance.simulateItinerary(start_origin, sequence, currentTime);
      return { sequence, itinerary };
    });

    // Wait for all promises to settle
    const results = await Promise.allSettled(sequencePromises);

    // Filter out successful results
    const validItineraries = results
      .filter((result) => result.status === "fulfilled" && result.value.itinerary)
      .map((result) => result.value);

    if (validItineraries.length > 0) {
      const bestItinerary = validItineraries.reduce((prev, curr) =>
        curr.itinerary.total_travel_time < prev.itinerary.total_travel_time ? curr : prev
      );

      console.log("::::::::::::::::::::::::::::::best sequence:::::::::::::::::::::::::::::::::::::::");
      console.log(bestItinerary.sequence);

      console.log("::::::::::::::::::::::::::::::best itinerary:::::::::::::::::::::::::::::::::::::::");
      console.log(bestItinerary.itinerary);

      if (email) {
        const emailData = new EmailFlightData();
        const subject = "Flight Itinerary";
        const emailContent = emailData.formatEmailContent(bestItinerary.sequence, bestItinerary.itinerary);
        await emailData.sendMail(email, subject, emailContent);
        console.log(`Email sent successfully: ${email}`);
      }

      res.json({
        status: "SUCCESS",
        data: {
          best_sequence: bestItinerary.sequence,
          best_itinerary: bestItinerary.itinerary,
        },
      });
    } else {
      res.status(400).json({
        status: "FAILED",
        message: "No valid itineraries were found across all sequences.",
      });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "FAILED", message: "An error occurred while fetching flight data." });
  }
});

// Test endpoint
app.get("/api/tests", async (req, res) => {
  const bestItinerary = {
    flights: [
      {
        airline: "LA",
        flight_number: "LA896",
        departure_time: moment.utc("2025-03-15T20:20:00").toDate(),
        arrival_time: moment.utc("2025-03-15T23:45:00").toDate(),
        origin: "PUQ",
        destination: "SCL",
        duration: moment.duration(12300, "seconds"),
        cost: 79.1,
        layover: moment.duration(10200, "seconds"),
        layover_iata: "PUQ",
      },
      // Add other flights here...
    ],
    total_flight_duration: moment.duration(1, "day").add(54300, "seconds"),
    total_layover_duration: moment.duration(1, "day").add(16500, "seconds"),
    total_travel_time: moment.duration(2, "days").add(79800, "seconds"),
    total_cost: 2954.19,
  };

  const bestSequence = ["SCL", "MIA", "MAD", "CAI", "DOH", "PER"];
  const email = "charlesnwoye2@gmail.com";
  const subject = "Flight Itinerary";

  const emailData = new EmailFlightData();
  const emailContent = emailData.formatEmailContent(bestSequence, bestItinerary);
  await emailData.sendMail(email, subject, emailContent);

  res.json({
    status: "SUCCESS",
    data: {
      best_itinerary: bestItinerary,
      best_sequence: bestSequence,
    },
  });
});

// Helper function for Cartesian product
function cartesianProduct(...arrays) {
  return arrays.reduce((a, b) => a.flatMap((d) => b.map((e) => [d, e].flat())));
}

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});