import express from "express";
import { login } from "../controller/userController";

const router = express.Router();

// Middleware for logging requests to this router
router.use((req, res, next) => {
  console.log(`User request received: ${req.method} ${req.originalUrl}`);
  next();
});

router.post("/auth-user", async (req, res, next) => {
  try {
    await login(req, res);
  } catch (error) {
    next(error);
  }
});

export default router;
