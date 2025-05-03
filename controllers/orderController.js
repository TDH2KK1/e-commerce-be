import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import Stripe from "stripe";
import crypto from "crypto";
import querystring from "qs";
import moment from "moment";
import dotenv from "dotenv";
dotenv.config();

// global variables
const currency = "inr";
const deliveryCharge = 10000;

// gateway initialize
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const vnp_HashSecret = process.env.VNP_HASH_SECRET;

// Placing orders using COD Method
const placeOrder = async (req, res) => {
  try {
    const { userId, items, amount, address } = req.body;

    const orderData = {
      userId,
      items,
      address,
      amount,
      paymentMethod: "COD",
      payment: false,
      date: Date.now(),
    };

    const newOrder = new orderModel(orderData);
    await newOrder.save();

    await userModel.findByIdAndUpdate(userId, { cartData: {} });

    res.json({ success: true, message: "Order Placed" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const paymentVNPayService = async (orderData,userId) => {
  try {
    const { items, amount, address } = orderData;
    const values = {
        userId,
      items,
      address,
      amount,
      paymentMethod: "VNPAY",
      payment: false,
      date: Date.now(),
    };
    const newOrder = new orderModel(values);
    await newOrder.save();
    await userModel.findByIdAndUpdate(userId, { cartData: {} });
    return { success: true, message: "Order Placed" };
  } catch (error) {
    console.log(error);
    return { success: false, message: error.message };
  }
};

// Placing orders using Stripe Method
const placeOrderStripe = async (req, res) => {
  try {
    const { userId, items, amount, address } = req.body;
    const { origin } = req.headers;

    const orderData = {
      userId,
      items,
      address,
      amount,
      paymentMethod: "Stripe",
      payment: false,
      date: Date.now(),
    };

    const newOrder = new orderModel(orderData);
    await newOrder.save();

    const line_items = items.map((item) => ({
      price_data: {
        currency: currency,
        product_data: {
          name: item.name,
        },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    }));

    line_items.push({
      price_data: {
        currency: currency,
        product_data: {
          name: "Delivery Charges",
        },
        unit_amount: deliveryCharge * 100,
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      success_url: `${origin}/verify?success=true&orderId=${newOrder._id}`,
      cancel_url: `${origin}/verify?success=false&orderId=${newOrder._id}`,
      line_items,
      mode: "payment",
    });

    res.json({ success: true, session_url: session.url });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// Verify Stripe
const verifyStripe = async (req, res) => {
  const { orderId, success, userId } = req.body;

  try {
    if (success === "true") {
      await orderModel.findByIdAndUpdate(orderId, { payment: true });
      await userModel.findByIdAndUpdate(userId, { cartData: {} });
      res.json({ success: true });
    } else {
      await orderModel.findByIdAndDelete(orderId);
      res.json({ success: false });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

const createVNPayUrl = async (req, res) => {
  try {
    let amount = req.body.amount;
    const id = Math.floor(Math.random() * 10000).toString();
    const vnp_Url = process.env.VNP_URL;
    const vnp_Returnurl = process.env.VNP_RETURN_URL;
    const vnp_TmnCode = process.env.VNP_TMNCODE; // Mã website tại VNPAY
    const vnp_HashSecret = process.env.VNP_HASH_SECRET; // Chuỗi bí mật

    const vnp_TxnRef = id; // Mã đơn hàng
    const vnp_OrderInfo = "Thanh+toan+don+hang+test";
    const vnp_OrderType = "billpayment";
    const vnp_Amount = amount * 100;
    const vnp_Locale = "vn";
    const vnp_BankCode = "NCB";
    const vnp_IpAddr =
      req.headers["x-forwarded-for"] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress;

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = String(currentDate.getMonth() + 1).padStart(2, "0");
    const day = String(currentDate.getDate()).padStart(2, "0");
    const hours = String(currentDate.getHours()).padStart(2, "0");
    const minutes = String(currentDate.getMinutes()).padStart(2, "0");
    const seconds = String(currentDate.getSeconds()).padStart(2, "0");

    const vnp_CreateDate = `${year}${month}${day}${hours}${minutes}${seconds}`;

    const inputData = {
      vnp_Version: "2.1.0",
      vnp_Command: "pay",
      vnp_TmnCode: vnp_TmnCode,
      vnp_Locale: vnp_Locale,
      vnp_CurrCode: "VND",
      vnp_TxnRef: vnp_TxnRef,
      vnp_OrderInfo: vnp_OrderInfo,
      vnp_OrderType: "other",
      vnp_Amount: vnp_Amount,
      vnp_ReturnUrl: vnp_Returnurl,
      vnp_IpAddr: vnp_IpAddr,
      vnp_CreateDate: vnp_CreateDate,
      vnp_BankCode: vnp_BankCode,
    };

    if (vnp_BankCode !== null) {
      inputData.vnp_BankCode = vnp_BankCode;
    }

    const inputDatas = sortObject(inputData);
    const signData = querystring.stringify(inputDatas, { encode: false });
    const hmac = crypto.createHmac("sha512", vnp_HashSecret);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
    inputDatas["vnp_SecureHash"] = signed;
    const finalUrl =
      vnp_Url + "?" + querystring.stringify(inputDatas, { encode: false });

    res.json({ vnpUrl: finalUrl });
  } catch (error) {
    throw error;
  }
};

// Placing orders using VNPay Method
// const createVNPayUrl = async (req, res) => {
//   process.env.TZ = "Asia/Ho_Chi_Minh";

//   let date = new Date();
//   let createDate = moment(date).format("YYYYMMDDHHmmss");

//   let ipAddr =
//     req.headers["x-forwarded-for"] ||
//     req.connection.remoteAddress ||
//     req.socket.remoteAddress ||
//     req.connection.socket?.remoteAddress;

//   let tmnCode = process.env.VNP_TMNCODE;
//   let secretKey = process.env.VNP_HASH_SECRET;
//   let vnpUrl = process.env.VNP_URL;
//   let returnUrl = process.env.VNP_RETURN_URL;

//   let orderId = moment(date).format("DDHHmmss");
//   let amount = req.body.amount;
//   let bankCode = req.body.bankCode;
//   let userId = req.body.userId;
//   let items = req.body.items;
//   let address = req.body.address;

//   // ⚠️ Bước này tạo order trước như Stripe
//   const newOrder = new orderModel({
//     userId,
//     items,
//     address,
//     amount,
//     paymentMethod: "VNPay",
//     payment: false,
//     date: Date.now(),
//   });
//   await newOrder.save();

//   let locale = req.body.language || "vn";

//   let currCode = "VND";
//   let vnp_Params = {};
//   vnp_Params["vnp_Version"] = "2.1.0";
//   vnp_Params["vnp_Command"] = "pay";
//   vnp_Params["vnp_TmnCode"] = tmnCode;
//   vnp_Params["vnp_Locale"] = locale;
//   vnp_Params["vnp_CurrCode"] = currCode;
//   vnp_Params["vnp_TxnRef"] = orderId;
//   vnp_Params["vnp_OrderInfo"] = "Thanh toan cho ma GD:" + orderId;
//   vnp_Params["vnp_OrderType"] = "other";
//   vnp_Params["vnp_Amount"] = amount * 100;

//   // ✅ Gắn userId và orderId thật vào returnUrl
//   vnp_Params[
//     "vnp_ReturnUrl"
//   ] = `${returnUrl}?success=true&method=VNPay&orderId=${newOrder._id}&userId=${userId}`;

//   vnp_Params["vnp_IpAddr"] = ipAddr;
//   vnp_Params["vnp_CreateDate"] = createDate;
//   if (bankCode) {
//     vnp_Params["vnp_BankCode"] = bankCode;
//   }

//   vnp_Params = sortObject(vnp_Params);

//   let signData = querystring.stringify(vnp_Params, { encode: false });
//   let hmac = crypto.createHmac("sha512", secretKey);
//   let signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");
//   vnp_Params["vnp_SecureHash"] = signed;
//   vnpUrl += "?" + querystring.stringify(vnp_Params, { encode: false });

//   res.json({ vnpUrl });
// };

const vnpayReturn = async (req, res) => {
  try {
    const orderData = req.body.orderData;
    let vnp_Params = { ...req.body.vnp_Params }; 
    let userId = req.body.userId;
    const secureHash = vnp_Params["vnp_SecureHash"];
    delete vnp_Params["vnp_SecureHash"];
    delete vnp_Params["vnp_SecureHashType"];

    vnp_Params = sortObject(vnp_Params);

    const secretKey = process.env.VNP_HASH_SECRET;

    const signData = querystring.stringify(vnp_Params, { encode: false });
    const hmac = crypto.createHmac("sha512", secretKey);
    const signed = hmac.update(Buffer.from(signData, "utf-8")).digest("hex");

    console.log("key1 (VNPay): " + secureHash);
    console.log("key2 (local): " + signed);

    if (secureHash === signed) {
      await paymentVNPayService(orderData,userId);
      res.json({ success: true, Message: "✔️ Checksum hợp lệ" });
    } else {
      res.json({ success: false, Message: "❌ Checksum sai" });
    }
  } catch (error) {
    console.error(error);
    res.json({ success: false, Message: "Lỗi xử lý" });
  }
};
// const vnpayReturn = async (req,res) => {
//     try {
//         const secureHash = req.query.vnp_SecureHash || req.body.vnp_SecureHash;
//         const vnp_Params = req.query; // Hoặc req.body tùy vào cách bạn nhận dữ liệu
//         const secretKey = process.env.VNPAY_SECRET_KEY; // Lấy secret key từ .env

//         // Tạo một string để tạo hash từ các tham số
//         let queryData = Object.keys(vnp_Params)
//           .filter(key => key !== 'vnp_SecureHash')
//           .sort()
//           .map(key => `${key}=${vnp_Params[key]}`)
//           .join('&');

//         // Tính toán hash từ dữ liệu đã lấy
//         const signed = crypto
//           .createHmac('sha512', secretKey)
//           .update(queryData)
//           .digest('hex');

//         // Kiểm tra xem secureHash có giống signed hay không
//         if (secureHash === signed) {
//           const orderId = req.query.orderId;
//           const userId = req.query.userId;
//           const responseCode = vnp_Params['vnp_ResponseCode'];

//           if (responseCode === '00') {
//             // Thanh toán thành công
//             await orderModel.findByIdAndUpdate(orderId, { payment: true });
//             await userModel.findByIdAndUpdate(userId, { cartData: {} });
//             return res.redirect(`${CLIENT_URL}/verify?success=true&orderId=${orderId}`);
//           } else {
//             // Thanh toán thất bại
//             await orderModel.findByIdAndDelete(orderId);
//             return res.redirect(`${CLIENT_URL}/verify?success=false&orderId=${orderId}`);
//           }
//         } else {
//           return res.redirect(`${CLIENT_URL}/verify?success=false`);
//         }
//       } catch (error) {
//         console.error(error);
//         res.status(500).send("Internal Server Error");
//       }
// }

const verifyVNPay = async (req, res) => {
  const { orderId, success, userId } = req.body;

  try {
    if (success === "true") {
      await orderModel.findByIdAndUpdate(orderId, { payment: true });
      await userModel.findByIdAndUpdate(userId, { cartData: {} });
      res.json({ success: true });
    } else {
      await orderModel.findByIdAndDelete(orderId);
      res.json({ success: false });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

function sortObject(obj) {
  let sorted = {};
  let str = [];
  let key;
  for (key in obj) {
    if (obj.hasOwnProperty(key)) {
      str.push(encodeURIComponent(key));
    }
  }
  str.sort();
  for (key = 0; key < str.length; key++) {
    sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, "+");
  }
  return sorted;
}

// All orders data for Admin Panel
const allOrders = async (req, res) => {
  try {
    const orders = await orderModel.find({});
    res.json({ success: true, orders });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// User Order Data For Frontend
const userOrders = async (req, res) => {
  try {
    const { userId } = req.body;

    const orders = await orderModel.find({ userId });
    res.json({ success: true, orders });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// update order status from Admin Panel
const updateStatus = async (req, res) => {
  try {
    const { orderId, status } = req.body;

    await orderModel.findByIdAndUpdate(orderId, { status });
    res.json({ success: true, message: "Status Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

export {
  verifyStripe,
  verifyVNPay,
  placeOrder,
  placeOrderStripe,
  createVNPayUrl,
  vnpayReturn,
  allOrders,
  userOrders,
  updateStatus,
};
