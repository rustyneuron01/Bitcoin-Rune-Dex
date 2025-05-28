import { default as mongoose, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

const DepositSchema = new Schema(
  {
    depositId: { type: String, default: uuidv4, unique: true },
    userId: { type: String, require: true },
    txId: { type: String, default: "" },
    amount: { type: Number, require: true },
    psbt: { type: String, require: true, unique: true },
    signedPSBT: { type: String, default: "" },
    status: { type: Number, default: 0 },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("DepositSchema", DepositSchema);
