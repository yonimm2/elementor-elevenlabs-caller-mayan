import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { parsePhoneNumberFromString } from "libphonenumber-js";

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Normalize phone to E.164 (+1..., +972..., etc.)
function normalize(phone) {
  try {
    const raw = phone.toString().trim();
    const parsed = parsePhoneNumberFromString(raw, "US"); // fallback to US
    return parsed && parsed.isValid() ? parsed.number : null;
  } catch (err) {
    return null;
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// MAIN ELEMENTOR WEBHOOK
app.post("/elementor/lead", async (req, res) => {
  try {
    console.log("[ELEMENTOR] Incoming body:", req.body);

    const name =
      req.body.name ||
      req.body.fullname ||
      req.body.first_name ||
      "Unknown";

    const phone =
      req.body.phone ||
      req.body.phonenumber ||
      req.body.mobile ||
      req.body.tel;

    if (!phone) {
      console.log("[ERROR] No phone found");
      return res.status(400).json({ error: "Phone number required" });
    }

    const normalized = normalize(phone);
    if (!normalized) {
      console.log("[ERROR] Invalid phone format:", phone);
      return res.status(400).json({ error: "Invalid phone number" });
    }

    console.log("[OK] Normalized phone:", normalized);

    // CALL ELEVENLABS OUTBOUND
    const payload = {
      phone_number: normalized,
      metadata: {
        name,
        source: "elementor"
      },
      conversation_initiation_client_data: {
        source_info: {
          name: "elementor-caller",
          version: "1.0.0"
        }
      }
    };

    console.log("[ELEVENLABS PAYLOAD]", payload);

    const response = await axios.post(
      `https://api.elevenlabs.io/v1/convai/agents/${process.env.ELEVENLABS_AGENT_ID}/calls`,
      payload,
      {
        headers: {
          "xi-api-key": process.env.XI_API_KEY,
          "Content-Type": "application/json"
        }
      }
    );

    console.log("[ELEVENLABS RESPONSE]", response.data);

    return res.json({
      success: true,
      called: normalized,
      agent: process.env.ELEVENLABS_AGENT_ID
    });
  } catch (err) {
    console.error("[SERVER ERROR]", err.response?.data || err.message);
    return res.status(500).json({ error: "Internal error" });
  }
});

// Render uses PORT automatically
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

