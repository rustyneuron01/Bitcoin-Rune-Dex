import { default as mongoose, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

const WaitEtchingSchema = new Schema(
  {
    waitEtchingId: { type: String, default: uuidv4, unique: true },
    imageEtchingTxId: { type: String, default: "" },
    userId: { type: String, required: true },
    runeName: { type: String, required: true },
    runeSymbol: { type: String, required: true },
    creatorAddress: { type: String, required: true },
    fee: { type: Number, required: true },
    calcTxFee: { type: Number, required: true },
    address: { type: String, required: true },
    ordinal_p2tr: { type: Object, required: true },
    redeem: { type: Object, required: true },
    txId: { type: String, default: "" },
    status: { type: Number, default: 0 }, // 0: pending, 1: signed, 2: success, 3: fail
    btcBalance: { type: Number, default: 0 },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("waitEtching", WaitEtchingSchema);
