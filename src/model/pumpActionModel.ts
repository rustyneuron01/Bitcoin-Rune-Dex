import { default as mongoose, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

const pumpActionSchema = new Schema(
  {
    pumpActionId: { type: String, default: uuidv4, unique: true },
    userId: { type: String, require: true },
    btcAmount: { type: Number, default: 0 },
    runeId: { type: String, default: "" },
    runeAmount: { type: Number, default: 0 },
    type: { type: Number, default: 0 }, // 0: Buy, 1: Sell
    txId: { type: String, default: "" },
    status: { type: Number, default: 0 }, // 0: Pending, 1: Tx Created, 2: Confirmed
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("pumpActionSchema", pumpActionSchema);
