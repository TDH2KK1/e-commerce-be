import express from 'express'
import { placeOrder, placeOrderStripe, createVNPayUrl, allOrders, userOrders, updateStatus, verifyStripe, verifyVNPay, vnpayReturn } from '../controllers/orderController.js'
import adminAuth from '../middleware/adminAuth.js'
import authUser from '../middleware/auth.js'

const orderRouter = express.Router()

// Admin Features
orderRouter.post('/list',adminAuth,allOrders)
orderRouter.post('/status',adminAuth,updateStatus)

// Payment Features
orderRouter.post('/place',authUser,placeOrder)
orderRouter.post('/stripe',authUser,placeOrderStripe)
orderRouter.post('/vnpay', authUser,createVNPayUrl)
orderRouter.post('/vnpay_return',authUser, vnpayReturn)

// User Feature
orderRouter.post('/userorders',authUser,userOrders)

// Verify payment
orderRouter.post('/verifyStripe',authUser, verifyStripe)
orderRouter.post('/verifyVNPay',authUser, verifyVNPay)

export default orderRouter