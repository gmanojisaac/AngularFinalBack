// server.js
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
var fyersModel = require("fyers-api-v3").fyersModel;
let DataSocket = require("fyers-api-v3").fyersDataSocket;

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
let selectedPrice = 100;
let startTrade = false;
let startaTrade = false;


let spotPrice = 0;
let ceSymbol = "";
let peSymbol = "";

let ceSymbolnext = "";
let peSymbolnext = "";

let ceSymbolValue = "";
let peSymbolValue = "";

let ceSymbolnextValue = "";
let peSymbolnextValue = "";

let updatearray = false;
let cePrice = null;
let pePrice = null;
let cenextPrice = null;
let penextPrice = null;

let selectedceSymbolVal = null;
let selectedpeSymbolVal = null;

let selectedceSymbolPrice = null;
let selectedpeSymbolPrice = null;


let ceSymbolnextVal = null;
let peSymbolnextVal = null;

let subslist = [];

let percentprofit = 0.1;


const orderIdsArray = [];
const TradeIdsArray = [];

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
    receivedData.secret != undefined &&
    receivedData.label !== undefined
  ) {
    //console.log('reached here')
    currentWeeklyExpiry = receivedData.label;
    fyers
      .generate_access_token({
        client_id: savedappId,
        secret_key: receivedData.secret,
        auth_code: receivedData.autn,
      })
      .then(async (response) => {
        if (response.s == "ok") {
          fyers.setAccessToken(response.access_token);
          //console.log(response.access_token);
          // Fine the CE/PE price and symbol
          res.json({ message: "res:" + "success access token:" });

          spotPrice = await getBankNiftySpotPrice();
          console.log(`Bank Nifty Spot Price: ${spotPrice - (spotPrice % 100)}`);
      
          openWebSocket(spotPrice, currentWeeklyExpiry);
        } else {
          console.log("error generating access token", response);
        }
      });
    //res.json({ message: "res:" + "success access token:" });
  } else if(receivedData.side !== undefined){
      
      selectedside = receivedData.side;
      if (selectedside == 'CE'){
        //selectedceSymbolVal = ceSymbolnext;
        //selectedceSymbolPrice = cenextPrice;
        res.json({ message: "res:" + selectedceSymbolPrice });
      }else{
        res.json({ message: "res:" + selectedpeSymbolPrice });
      }
      //Learnings - > split will return 2 sides of the split
      //If you want to slice the Number then slice 2 places instead of 1 
  } else if(receivedData.trade !== undefined){
      
    startTrade = receivedData.trade;
    //console.log ('Side:', selectedside )
    //res.json({ message: "res:" + selectedPrice });

    if (selectedside == 'CE'){
      placeBracketOrder(selectedceSymbolVal, selectedceSymbolPrice, percentprofit).then( _ =>{
        res.json(orderIdsArray);
    });
    }else{
      placeBracketOrder(selectedpeSymbolVal, selectedpeSymbolPrice, percentprofit).then( _ =>{
        res.json(orderIdsArray);
    });
    }
    //Learnings - > split will return 2 sides of the split
    //If you want to slice the Number then slice 2 places instead of 1 
} else if(receivedData.atrade !== undefined){
      
  startaTrade = receivedData.atrade;
  //console.log ('Side:', selectedside )
  res.json({ message: "res:" + selectedPrice });
  //Learnings - > split will return 2 sides of the split
  //If you want to slice the Number then slice 2 places instead of 1 
} else if(receivedData.mytrade !== undefined){

  fetchAndFilterOrders(orderIdsArray).then(_=>{
    res.json(TradeIdsArray);
  });
  
  //Learnings - > split will return 2 sides of the split
  //If you want to slice the Number then slice 2 places instead of 1 
}
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

async function fetchAndFilterOrders(orderIdsArray) {
  try {
    // Fetch all orders using Fyers API's get_orders method
    const orderResponse = await fyers.get_orders();

    // Check if the API call was successful
    if (orderResponse.s === 'ok' && orderResponse.data) {
      // Extract the orders data
      const allOrders = orderResponse.data;

      // Filter orders by orderType from the passed orderIdsArray
      const parentOrder = orderIdsArray.find(order => order.orderType === 'parent');
      const stopLossOrder = orderIdsArray.find(order => order.orderType === 'stopLoss');
      const takeProfitOrder = orderIdsArray.find(order => order.orderType === 'takeProfit');
 
      if (parentOrder.status == 'Filled'){
        const entryprice = parentOrder.tradedPrice;
        if(stopLossOrder.status == 'Filled'){          
          TradeIdsArray.push({
            Type: 'MarketStop',
            Price: stopLossOrder.tradedPrice,
            Time: stopLossOrder.orderDateTime.split(' ')[1],
            Profit: orderIdsArray[0].Profit + (entryprice - stopLossOrder.tradedPrice )
          });
          orderIdsArray=[];
        } else if(takeProfitOrder.status == 'Filled'){
          TradeIdsArray.push({
            Type: 'MarketStop',
            Price: takeProfitOrder.tradedPrice,
            Time: takeProfitOrder.orderDateTime.split(' ')[1],
            Profit: orderIdsArray[0].Profit + ( stopLossOrder.tradedPrice - entryprice )
          });
          orderIdsArray=[];
        }
      }
      return TradeIdsArray;
    } else {
      console.error('Failed to retrieve orders:', orderResponse.message);
    }
  } catch (error) {
    console.error('Error fetching orders:', error);
  }
}

async function getBankNiftySpotPrice() {
  try {
    const response = await fyers.getQuotes(["NSE:NIFTYBANK-INDEX"]);
    if (response.s && response.d.length > 0) {
      return Math.round(response.d[0].v.lp); // Last traded price
    } else {
      throw new Error("Could not fetch Bank Nifty spot price.");
    }
  } catch (error) {
    console.error("Error fetching Bank Nifty spot price:", error);
    throw error;
  }
}
//console.log(URL);


// Open WebSocket connection to receive real-time data
function openWebSocket(spot, expiry) {
  // Event: When WebSocket is connected
  dataSocket.on("connect", function () {
    console.log("WebSocket connected.");

    // Create CE and PE symbols with closest strikes
    ceSymbol = `NSE:BANKNIFTY${currentWeeklyExpiry}${
      Math.round(spotPrice - (spotPrice % 100)) + 100
    }CE`;
    ceSymbolValue = Math.round(spotPrice - (spotPrice % 100)) + 100;
    ceSymbolnext = `NSE:BANKNIFTY${currentWeeklyExpiry}${Math.round(
      spotPrice - (spotPrice % 100)
    )}CE`;
    ceSymbolnextValue = Math.round(spotPrice - (spotPrice % 100));
    peSymbol = `NSE:BANKNIFTY${currentWeeklyExpiry}${Math.round(
      spotPrice - (spotPrice % 100)
    )}PE`;
    peSymbolValue = Math.round(spotPrice - (spotPrice % 100)) ;
    peSymbolnext = `NSE:BANKNIFTY${currentWeeklyExpiry}${
      Math.round(spotPrice - (spotPrice % 100)) + 100
    }PE`;
    peSymbolnextValue = Math.round(spotPrice - (spotPrice % 100) + 100);
    subslist.push(ceSymbol);
    subslist.push(peSymbol);
    subslist.push(ceSymbolnext);
    subslist.push(peSymbolnext);
    // Subscribe to CE and PE symbols for real-time data
    dataSocket.subscribe(subslist);
    dataSocket.mode(dataSocket.LiteMode);
  });

  // Event: When a new message (data) is received from the WebSocket
  dataSocket.on("message", function (message) {
    //console.log("Received real-time data:", message);

    switch (message.symbol) {
      case ceSymbol:
        //console.log(ceSymbol ,';', cenextPrice,  message.ltp);
        if (ceSymbolnextVal !== null) {
          if (message.ltp > 150 && cenextPrice > 150) {
            ceSymbolValue = ceSymbolValue + 100;
            ceSymbolnextValue = ceSymbolnextValue + 100;
            updatearray = true;
          } else if (message.ltp < 150 && cenextPrice > 150) {
            
            cePrice = message.ltp;
           // console.log(ceSymbol, ceSymbolnext , ":", message.ltp); //200/100
            if (pePrice !== null) {
              if (
                Math.abs(cePrice - pePrice) > Math.abs(cenextPrice - pePrice)
              ) {
                //console.log('selected: CE next Price : ', cenextPrice);
                selectedceSymbolVal = ceSymbolnext;
                selectedceSymbolPrice = cenextPrice;
                //Trend received
                //do trade in cenextPrice
                //Trend change received
                //check the BO if the loss has beeen booked - update the total loss else ignore it
                //if no trades then act on the trend change signal wwith proper stop profit
              } else {
                //console.log('selected: CE Price : ', cePrice);
                selectedceSymbolVal = ceSymbol;
                selectedceSymbolPrice = cePrice;
                //do trade in cePrice
                //Trend received
                //do trade in cePrice
                //Trend change received
                //check the BO if the loss has beeen booked - update the total loss else ignore it
                //if no trades then act on the trend change signal wwith proper stop profit
              }
            }
          } else if (message.ltp < 150 && cenextPrice < 150) {
            ceSymbolValue = ceSymbolValue - 100;
            ceSymbolnextValue = ceSymbolnextValue - 100;
            updatearray = true;
          }
        }
        break;
      case ceSymbolnext:
        //console.log(peSymbolnext , message.ltp);
        ceSymbolnextVal = true;
        cenextPrice = message.ltp;
        break;

      case peSymbol:
        if (peSymbolnextVal !== null) {
          //console.log(peSymbol ,';', penextPrice,  message.ltp);
          if (message.ltp > 150 && penextPrice > 150) {
            peSymbolValue = peSymbolValue - 100;
            peSymbolnextValue = peSymbolnextValue - 100;
            updatearray = true;
          } else if (message.ltp < 150 && penextPrice > 150) {
            //console.log(peSymbol, ":", message.ltp, peSymbolnext); // 800/900            
            pePrice = message.ltp;
            if (Math.abs(pePrice - cePrice) > Math.abs(penextPrice - cePrice)) {
                //console.log('selected: PE next Price : ', penextPrice);
                selectedpeSymbolVal = peSymbolnext;
                selectedpeSymbolPrice = penextPrice;
              //Trend received
              //do trade in penextPrice
              //Trend change received
              //check the BO if the loss has beeen booked - update the total loss else ignore it
              //if no trades then act on the trend change signal wwith proper stop profit
            } else {
              //console.log('selected: PE Price : ', pePrice);
              selectedpeSymbolVal = peSymbol;
              selectedpeSymbolPrice = pePrice;
              //do trade in pePrice
              //Trend received
              //do trade in pePrice
              //Trend change received
              //check the BO if the loss has beeen booked - update the total loss else ignore it
              //if no trades then act on the trend change signal wwith proper stop profit
            }
          } else if (message.ltp < 150 && penextPrice < 150) {
            peSymbolValue = peSymbolValue + 100;
            peSymbolnextValue = peSymbolnextValue + 100;
            updatearray = true;
          }
        }
        break;

      case peSymbolnext:
        //console.log(peSymbolnext , message.ltp);
        peSymbolnextVal = true;
        penextPrice = message.ltp;
        break;
    }

    if (updatearray == true) {
      updatearray = false;
      ceSymbol = `NSE:BANKNIFTY${currentWeeklyExpiry}${ceSymbolValue}CE`;

      ceSymbolnext = `NSE:BANKNIFTY${currentWeeklyExpiry}${ceSymbolnextValue}CE`;

      peSymbol = `NSE:BANKNIFTY${currentWeeklyExpiry}${peSymbolValue}PE`;

      peSymbolnext = `NSE:BANKNIFTY${currentWeeklyExpiry}${peSymbolnextValue}PE`;
      //subslist.splice(0, subslist.length); // Removes all elements
      console.log('reached');
      subslist.push(ceSymbol);
      subslist.push(peSymbol);
      subslist.push(ceSymbolnext);
      subslist.push(peSymbolnext);
      dataSocket.subscribe(subslist);
    }
  });

  // Event: Handle WebSocket errors
  dataSocket.on("error", function (error) {
    console.error("WebSocket error:", error);
  });

  // Event: When WebSocket connection is closed
  dataSocket.on("close", function () {
    console.log("WebSocket connection closed.");
  });

  // Connect the WebSocket
  dataSocket.connect();
}

// Function to place a bracket order
async function placeBracketOrder(orderSymbol, ltp, percentprofit) {
  //let orderSymbol = globalOption;
  let limitPrice = Math.round(ltp + 0.5);
  let stopLossPrice = Math.round(ltp * 0.1);
  let takeProfitPrice = Math.round(ltp * percentprofit); // Adjust as per your logic

  // Place a bracket order
  const reqBody = {
      "symbol": orderSymbol,
      "qty": 15,
      "type": 1, // Limit order
      "side": 1, // Buy -1 
      "productType": "BO", // Bracket Order
      "limitPrice": limitPrice,
      "stopPrice": (stopLossPrice * 10) + 0.25,
      "validity": "DAY",
      "stopLoss": stopLossPrice,
      "takeProfit": takeProfitPrice,
      "offlineOrder": false,
      "disclosedQty": 0
  };

  try {
      const response = await fyers.place_order(reqBody);
      console.log("Order Response:", response);

      if (response.s === 'ok') {
        console.log("Bracket Order placed successfully");
  
        const parentOrderId = response.id;
        const stopLossOrderId = response.sl_order_id;   // Assuming `sl_order_id` contains the stop-loss order ID
        const takeProfitOrderId = response.tp_order_id; 

        // Example: Adding price and status (replace with real data from the response)
      const parentOrderPrice = orderData.limit_price; // Limit price
      const stopLossPrice = orderData.stopPrice;      // Stop-loss trigger price
      const takeProfitPrice = orderData.take_profit;  // Take-profit price

      // Example: Status (replace with real data from response)
      const status = "pending"; // Placeholder for order status (e.g., pending, completed, etc.)
 // Push individual JSON objects into the array
 orderIdsArray.push({
  orderType: 'parent',
  orderId: parentOrderId,
  price: parentOrderPrice,
  status: status
});

orderIdsArray.push({
  orderType: 'stopLoss',
  orderId: stopLossOrderId,
  price: stopLossPrice,
  status: status
});

orderIdsArray.push({
  orderType: 'takeProfit',
  orderId: takeProfitOrderId,
  price: takeProfitPrice,
  status: status
});

      }
  } catch (error) {
      console.error("Error placing order:", error);
  }
}

// Function to check order status
async function checkOrderStatus(orderId, onCompletedCallback, onStopLossTriggeredCallback) {
  try {
      const response = await fyers.order_status({ "id": orderId });
      let orderStatus = response.data[0].status;
      console.log("Order Status:", orderStatus);

      // If stop-loss is hit
      if (orderStatus === "stop_loss_triggered") {
          //check order status and change the profit
          percentprofit = percentprofit + 0.1;
          totalLoss = Math.abs(response.data[0].netQty * response.data[0].tradedPrice);
          console.log("Stop-loss hit, total loss:", totalLoss);
          // Execute stop-loss triggered callback
          if (typeof onStopLossTriggeredCallback === "function") {
            onStopLossTriggeredCallback(totalLoss);
          }
      }

          // Callback for completed orders
    if (orderStatus === "COMPLETED") {
      if (typeof onCompletedCallback === "function") {
        onCompletedCallback(orderData);
      }
    }
    
  } catch (error) {
      console.error("Error checking order status:", error);
  }
}

// Define the callback for completed orders
function handleCompletedOrder(orderData) {
  console.log("Order has been completed. Order details:", orderData);
  // Add any additional logic for completed orders here
}


// Define the callback for stop-loss triggered
function handleStopLossTriggered(totalLoss) {
  console.log("Total loss:", totalLoss);
  // Add any additional logic for stop-loss triggered orders here
}
