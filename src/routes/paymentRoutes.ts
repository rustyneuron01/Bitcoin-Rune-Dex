import express from "express";
import rateLimit from "express-rate-limit";
import routerx from "express-promise-router";
import {
  preDepositBtc,
  depositBtc,
  withdrawToken,
  preWithdrawToken,
} from "../controller/txController";

const router = routerx();

const paymentLimitter = rateLimit({
  windowMs: 5 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware for logging requests to this router
router.use((req, res, next) => {
  console.log(`Deposit request received: ${req.method} ${req.originalUrl}`);
  next();
});

router.post("/pre-deposit", async (req, res, next) => {
  try {
    await preDepositBtc(req, res);
  } catch (error) {
    next(error);
  }
});

router.post("/deposit", async (req, res, next) => {
  try {
    await depositBtc(req, res);
  } catch (error) {
    next(error);
  }
});

router.post("/pre-withdraw", paymentLimitter, async (req, res, next) => {
  try {
    await preWithdrawToken(req, res);
  } catch (error) {
    next(error);
  }
});

router.post("/withdraw", paymentLimitter, async (req, res, next) => {
  try {
    await withdrawToken(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
