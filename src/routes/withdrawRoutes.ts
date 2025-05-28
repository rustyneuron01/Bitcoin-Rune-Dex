import express from "express";
import { withdrawToken } from "../controller/txController";

const router = express.Router();

// Middleware for logging requests to this router
router.use((req, res, next) => {
  console.log(`Claim request received: ${req.method} ${req.originalUrl}`);
  next();
});

router.post("/claim-token", async (req, res, next) => {
  try {
    await withdrawToken(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
