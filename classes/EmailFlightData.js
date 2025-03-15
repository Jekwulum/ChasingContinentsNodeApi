const nodemailer = require("nodemailer");
const moment = require("moment-timezone");
require("dotenv").config();

class EmailFlightData {
  // Create a transporter for sending emails
  createTransporter() {
    return nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_ADDRESS,
        pass: process.env.EMAIL_PASSWORD,
      },
    });
  }

  // Send an email to the recipient_email with the given subject and content
  async sendMail(recipientEmail, subject, content) {
    const transporter = this.createTransporter();

    const mailOptions = {
      from: process.env.EMAIL_ADDRESS,
      to: recipientEmail,
      subject: subject,
      html: content,
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log("Email sent successfully.");
      return true;
    } catch (error) {
      console.error(`Error sending email: ${error}`);
      return false;
    }
  }

  // Format the flight itinerary data into an HTML email
  formatEmailContent(bestSequence, bestItinerary) {
    // Ensure bestItinerary is an object (if it's a JSON string, parse it)
    if (typeof bestItinerary === "string") {
      bestItinerary = JSON.parse(bestItinerary);
    }

    // Convert duration strings to moment.duration objects
    bestItinerary.totalFlightDuration = moment.duration(bestItinerary.totalFlightDuration);
    bestItinerary.totalLayoverDuration = moment.duration(bestItinerary.totalLayoverDuration);
    bestItinerary.totalTravelTime = moment.duration(bestItinerary.totalTravelTime);

    const flightSequence = bestSequence.join(" → ");

    const flightDetails = bestItinerary.flights.map((flight) => {
      console.log(flight);
      const departureTime = new Date(flight.departureTime).toLocaleString();
      const arrivalTime = new Date(flight.arrivalTime).toLocaleString();

      // Convert flight durations to moment.duration objects
      flight.duration = moment.duration(flight.duration);
      flight.layover = moment.duration(flight.layover);
      console.log(`flight duration: ${flight.duration}`);
      console.log(`layover duration: ${flight.layover}`);

      return `
        <li>
          <strong>${flight.airline} ${flight.flightNumber}</strong><br>
          <strong>Departure:</strong> ${departureTime} (${flight.origin})<br>
          <strong>Arrival:</strong> ${arrivalTime} (${flight.destination})<br>
          <strong>Duration:</strong> ${flight.duration.humanize()}<br>
          <strong>Cost:</strong> $${flight.cost.toFixed(2)}<br>
          <strong>Layover:</strong> ${flight.layover.humanize()} at ${flight.layoverIata}<br>
        </li>
      `;
    });

    const summary = `
      <ul>
        <li><strong>Total Flight Duration:</strong> ${bestItinerary.totalFlightDuration.humanize()}</li>
        <li><strong>Total Layover Duration:</strong> ${bestItinerary.totalLayoverDuration.humanize()}</li>
        <li><strong>Total Travel Time:</strong> ${bestItinerary.totalTravelTime.humanize()}</li>
        <li><strong>Total Cost:</strong> $${bestItinerary.total_cost.toFixed(2)}</li>
      </ul>
    `;

    const content = `
      <h1>Flight Itinerary</h1>
      <h2>Flight Sequence</h2>
      <p>${flightSequence}</p>

      <h2>Flight Details</h2>
      <ul>${flightDetails.join("")}</ul>

      <h2>Summary</h2>
      ${summary}
    `;

    return content;
  }
}

module.exports = { EmailFlightData };