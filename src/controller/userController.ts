import { type Request, type Response } from "express";
import userModel from "../model/userModel";

export const login = async (req: Request, res: Response) => {
  try {
    const {
      paymentAddress,
      paymentPublicKey,
      ordinalAddress,
      ordinalPublicKey,
    } = req.body;
    if (!paymentAddress) {
      res
        .status(500)
        .json({ status: false, message: "payment address is invalid" });
      return;
    }
    let user: any = await userModel.findOne({ paymentAddress });
    if (!user) {
      let saveUserData = new userModel({
        paymentAddress,
        paymentPublicKey,
        ordinalAddress,
        ordinalPublicKey,
      });
      user = await saveUserData.save();
    }
    return res.status(200).json(user);
  } catch (error) {
    console.log(error);
    return res
      .status(500)
      .json({ success: false, msg: "Error While Fetching Rune Tokens" });
  }
};
