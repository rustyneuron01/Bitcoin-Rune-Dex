import express from "express";
import {
  fetchAllRuneToken,
  updateRuneValue,
} from "../controller/dashboardController";

const router = express.Router();

// Middleware for logging requests to this router
router.use((req, res, next) => {
  console.log(`Etching request received: ${req.method} ${req.originalUrl}`);
  next();
});

router.get("/", async (req, res, next) => {
  try {
    await fetchAllRuneToken(req, res);
  } catch (error) {
    next(error);
  }
});

router.post("/get-update-value", async (req, res, next) => {
  try {
    await updateRuneValue(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
