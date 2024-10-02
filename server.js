// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
var fyersModel = require("fyers-api-v3").fyersModel;
var fyers = new fyersModel({
  logs: "path where you want to save logs",
  enableLogging: true,
});

let savedappId = "";

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

let currentWeeklyExpiry = "24O01";
let selectedside = '';

// POST endpoint to receive JSON data
app.post("/api/appid", (req, res) => {
  const receivedData = req.body;

  //console.log("Received data:", receivedData);
  //fyers.setAppId("R3PYOUE8EO-100")
  if (receivedData.appid !== undefined) {
    savedappId = receivedData.appid;
    fyers.setAppId(receivedData.appid);
    fyers.setRedirectUrl(
      "https://trade.fyers.in/api-login/redirect-uri/index.html"
    );

    var URL = fyers.generateAuthCode();

    // Do something with the received data (e.g., store in database)

    res.json({ message: "res:" + fyers.generateAuthCode() });
  } else if (
    receivedData.autn !== undefined &&
    receivedData.secret != undefined
  ) {
    fyers
      .generate_access_token({
        client_id: savedappId,
        secret_key: receivedData.secret,
        auth_code: receivedData.autn,
      })
      .then((response) => {
        if (response.s == "ok") {
          fyers.setAccessToken(response.access_token);
          //console.log(response.access_token);
          res.json({ message: "res:" + "success access token:" });
        } else {
          console.log("error generating access token", response);
        }
      });
  } else if(receivedData.weeklylabel !== undefined && receivedData.side !== undefined){
    currentWeeklyExpiry = receivedData.weeklylabel;
    selectedside = receivedData.side;
    console.log ('received label:',currentWeeklyExpiry, 'Side:', selectedside )
    res.json({ message: "res:" + "100" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

console.log(URL);
