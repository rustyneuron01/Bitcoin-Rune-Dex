import express from "express";
import rateLimit from "express-rate-limit";
import routerx from "express-promise-router";
import {
  getPumpActions,
  pumpBuyActionToken,
  pumpPreActionToken,
  pumpSellActionToken,
} from "../controller/txController";

const router = routerx();

const buySellLimitter = rateLimit({
  windowMs: 10 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
});

// Middleware for logging requests to this router
router.use((req, res, next) => {
  console.log(
    `Token Buy & Sell request received: ${req.method} ${req.originalUrl}`
  );
  next();
});

router.post("/get-pump", async (req, res, next) => {
  try {
    await getPumpActions(req, res);
  } catch (error) {
    next(error);
  }
});

router.post("/pre-buy-rune", async (req, res, next) => {
  try {
    await pumpPreActionToken(req, res, 0);
  } catch (error) {
    next(error);
  }
});

router.post("/buy-rune", buySellLimitter, async (req, res, next) => {
  try {
    await pumpBuyActionToken(req, res);
  } catch (error) {
    next(error);
  }
});

router.post("/pre-sell-rune", async (req, res, next) => {
  try {
    await pumpPreActionToken(req, res, 1);
  } catch (error) {
    next(error);
  }
});

router.post("/sell-rune", buySellLimitter, async (req, res, next) => {
  try {
    await pumpSellActionToken(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
