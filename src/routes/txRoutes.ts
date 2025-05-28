import express from "express";
import {
  preSellRuneToken,
  sellRuneToken,
  preBuyRuneToken,
  buyRuneToken,
} from "../controller/txController";
import { distributeToken } from "../service/transfer.service";

const router = express.Router();

// Middleware for logging requests to this router
router.use((req, res, next) => {
  console.log(`Swap request received: ${req.method} ${req.originalUrl}`);
  next();
});

// router.post("/pre-sell-rune", async (req, res, next) => {
//   try {
//     await preSellRuneToken(req, res);
//   } catch (error) {
//     next(error);
//   }
// });

// router.post("/sell-rune", async (req, res, next) => {
//   try {
//     await sellRuneToken(req, res);
//   } catch (error) {
//     next(error);
//   }
// });

// router.post("/pre-buy-rune", async (req, res, next) => {
//   try {
//     await preBuyRuneToken(req, res);
//   } catch (error) {
//     next(error);
//   }
// });

// router.post("/buy-rune", async (req, res, next) => {
//   try {
//     await buyRuneToken(req, res);
//   } catch (error) {
//     next(error);
//   }
// });

// router.get("/test", async (req, res, next) => {
//   await distributeToken();
// });

export default router;
