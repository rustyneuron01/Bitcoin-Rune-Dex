import { default as mongoose, Schema } from "mongoose";
import { v4 as uuidv4 } from "uuid";

const UserSchema = new Schema(
  {
    userId: { type: String, default: uuidv4, unique: true },
    walletType: { type: String, require: true },
    paymentAddress: { type: String, require: true },
    paymentPublicKey: { type: Object, require: true },
    ordinalAddress: { type: String, require: true },
    ordinalPublicKey: { type: Object, require: true },
    btcBalance: { type: Number, default: 0 },
  },
  {
    timestamps: {
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  }
);

export default mongoose.model("UserSchema", UserSchema);
