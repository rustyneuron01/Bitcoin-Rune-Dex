import { type Request, type Response } from "express";
import { verifyMessage } from "@unisat/wallet-utils";
import mempoolJS from "@mempool/mempool.js";
import txListModel from "../model/txListModel";
import {
  generateRuneSendPsbt,
  generateBTCSendPsbt,
  createRune,
} from "../service/purchase.psbt.service";
import { combinePsbt } from "../service/psbt.utils";
import {
  getTxListObjectViaId,
  getEtchingRuneObjectViaName,
} from "../service/database.service";
import {
  getRuneUtxoByAddress,
  getBtcUtxoByAddress,
} from "../service/psbt.utils";
import { getRuneToken } from "../service/database.service";
import { calcTokenBalance } from "../service/utils.service";
import {
  ADMIN_ORDINAL_ADDRESS,
  ADMIN_PAYMENT_ADDRESS,
  SAT_DECIMAL,
} from "../config/config";
import { DepositTxStatus, TxListStatus } from "../config/constant";
import etchingRuneModel from "../model/etchingRuneModel";
import depositModel from "../model/depositModel";
import userModel from "../model/userModel";
import pumpActionModel from "../model/pumpActionModel";
import runeBalanceModel from "../model/runeBalanceModel";
import requestModel from "../model/requestModel";
import withdrawModel from "../model/withdrawModel";

import {
  execRequest,
  getOrCreateMultiSigWallet,
  makeRequest,
} from "./nativeMusig.controller";
import { wallet } from "./etchingController";
import { acceptMultisigSignPsbt } from "../service/multisig.service";

export const getTxDetails = async (txid: string) => {
  console.log("= = = = = = =");
  const {
    bitcoin: { transactions },
  } = mempoolJS({
    hostname: "mempool.space",
    network: "testnet", // 'signet' | 'testnet' | 'mainnet',
  });

  // const txid = 'e32b7feb05fba76f5f02ed5f481fe904bd848272286ee1dc9af4723d53f284ce';
  const tx = await transactions.getTx({ txid });
  console.log(tx);
  return tx;
};

// getTxDetails("e32b7feb05fba76f5f02ed5f481fe904bd848272286ee1dc9af4723d53f284ce")

export const RuneInfoOrCreat = async (userId: string, runeId: string) => {
  let runeInfo = await runeBalanceModel.findOne({ userId, runeId });
  if (!runeInfo) {
    runeInfo = new runeBalanceModel({
      userId,
      runeId,
    });
    await runeInfo.save();
  }

  return runeInfo;
};

export const preSellRuneToken = async (req: Request, res: Response) => {
  try {
    const {
      runeId,
      runeName,
      runeAmount,
      senderPaymentAddress,
      senderPaymentPubkey,
      senderOrdinalAddress,
      senderOrdinalPubkey,
    } = req.body;

    const runeBlock = runeId.split(":")[0];
    const runeTx = runeId.split(":")[1];
    const usedTxList: string[] = [];

    const btcUtxos = await getBtcUtxoByAddress(senderPaymentAddress);
    const { runeUtxos, tokenSum, divisibility } = await getRuneUtxoByAddress(
      senderOrdinalAddress,
      runeBlock + ":" + runeTx
    );

    if (tokenSum < runeAmount * 10 ** divisibility)
      return res
        .status(500)
        .json({ success: false, msg: "You have not got enough token" });

    const splitRune = createRune(
      BigInt(runeBlock),
      BigInt(runeTx),
      tokenSum,
      runeAmount * 10 ** divisibility
    );

    const psbt = await generateRuneSendPsbt(
      splitRune.buffer,
      btcUtxos,
      runeUtxos,
      ADMIN_PAYMENT_ADDRESS,
      usedTxList,
      senderOrdinalPubkey,
      senderPaymentPubkey,
      senderPaymentAddress,
      senderOrdinalAddress
    );

    const newTxList = new txListModel({
      receiveAddress: senderPaymentAddress,
      runeName,
      runeId,
      type: 1,
      runeAmount: runeAmount * 10 ** divisibility,
      psbt: psbt.toHex(),
    });

    const saveTx = await newTxList.save();

    return res.status(200).json({
      success: true,
      id: saveTx.id,
      psbtHex: psbt.toHex(),
      psbtBase64: psbt.toBase64(),
    });
  } catch (error) {
    console.log("Pre Sell Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Selling Rune Tokens" });
  }
};

export const sellRuneToken = async (req: Request, res: Response) => {
  try {
    const { id, signedPsbt } = req.body;
    const txListRuneDoc: any = await getTxListObjectViaId(id);
    const runeDocument = await getEtchingRuneObjectViaName(
      txListRuneDoc.runeName
    );
    if (!runeDocument)
      return res
        .status(500)
        .json({ success: false, msg: "Can not find Rune Token" });
    const remainRuneAmount = await getRuneToken(runeDocument);

    const tokenBalance = await calcTokenBalance(
      remainRuneAmount + txListRuneDoc.runeAmount,
      runeDocument.runeAmount * runeDocument.initialPrice
    );

    console.log(tokenBalance);

    const txId = await combinePsbt(txListRuneDoc.psbt, signedPsbt);
    console.log("Sell Rune Token TxID => ", txId);

    txListRuneDoc.txId = txId;
    txListRuneDoc.status = TxListStatus.PENDING;
    txListRuneDoc.signedPSBT = signedPsbt;
    txListRuneDoc.btcAmount = tokenBalance * txListRuneDoc.runeAmount;
    await txListRuneDoc.save();

    return res
      .status(200)
      .json({ success: true, msg: "Selling Token Now. Please Wait!" });
  } catch (error) {
    console.log("Sell Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Selling Rune Tokens" });
  }
};

export const preBuyRuneToken = async (req: Request, res: Response) => {
  try {
    const {
      walletType,
      runeId,
      runeName,
      runeAmount,
      buyerPaymentAddress,
      buyerPaymentPubkey,
      buyerOrdinalAddress,
      buyerOrdinalPubkey,
    } = req.body;
    console.log(
      walletType,
      runeId,
      runeName,
      runeAmount,
      buyerPaymentAddress,
      buyerPaymentPubkey,
      buyerOrdinalAddress,
      buyerOrdinalPubkey
    );
    const runeDocument = await getEtchingRuneObjectViaName(runeName);
    if (!runeDocument)
      return res
        .status(500)
        .json({ success: false, msg: "Can not find Rune Token" });
    const remainRuneAmount = await getRuneToken(runeDocument);
    if (runeAmount * 10 ** runeDocument.divisibility > remainRuneAmount)
      return res.status(500).json({ success: false, msg: "Not Enough Tokens" });

    const tokenBalance = await calcTokenBalance(
      remainRuneAmount - runeAmount * 10 ** runeDocument.divisibility,
      runeDocument.runeAmount * runeDocument.initialPrice
    );
    const usedUtxos: string[] = [];

    const generateBuyRunePsbt = await generateBTCSendPsbt(
      walletType,
      ADMIN_PAYMENT_ADDRESS,
      buyerOrdinalPubkey,
      buyerPaymentPubkey,
      buyerOrdinalAddress,
      tokenBalance * runeAmount * 10 ** runeDocument.divisibility,
      usedUtxos
    );

    const newTxList = new txListModel({
      receiveAddress: buyerOrdinalAddress,
      runeName,
      runeId,
      type: 0,
      runeAmount: runeAmount * 10 ** runeDocument.divisibility,
      psbt: generateBuyRunePsbt.toHex(),
      btcAmount: tokenBalance * runeAmount * 10 ** runeDocument.divisibility,
    });

    const saveTx = await newTxList.save();

    return res.status(200).json({
      success: true,
      id: saveTx.id,
      psbtHex: generateBuyRunePsbt.toHex(),
      psbtBase64: generateBuyRunePsbt.toBase64(),
    });
  } catch (error) {
    console.log("Pre Buy Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Buying Rune Tokens" });
  }
};

export const buyRuneToken = async (req: Request, res: Response) => {
  try {
    const { id, userId, signedPsbt, walletType } = req.body;
    const userDocument = await userModel.findOne({ userId });
    if (!userDocument) {
      return res.status(500).json({
        success: false,
        msg: "User doesn't exist",
      });
    }

    const txListRuneDoc: any = await getTxListObjectViaId(id);
    const runeDocument = await getEtchingRuneObjectViaName(
      txListRuneDoc.runeName
    );
    if (!runeDocument)
      return res
        .status(500)
        .json({ success: false, msg: "Can not find Rune Token" });

    const txId = await combinePsbt(txListRuneDoc.psbt, signedPsbt);
    console.log("Buy Rune Token TxID => ", txId);

    txListRuneDoc.txId = txId;
    txListRuneDoc.status = TxListStatus.PENDING;
    txListRuneDoc.signedPSBT = signedPsbt;
    await txListRuneDoc.save();

    return res
      .status(200)
      .json({ success: true, msg: "Buying Token Now. Please Wait!" });
  } catch (error) {
    console.log("Buy Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Buying Rune Tokens" });
  }
};

export const preDepositBtc = async (req: Request, res: Response) => {
  try {
    let { walletType, userId, depositAmount } = req.body;
    const userDocument = await userModel.findOne({ userId });
    if (!userDocument) {
      return res.status(500).json({
        success: false,
        msg: "User doesn't exist",
      });
    }

    let buyerPaymentAddress = userDocument?.paymentAddress;
    let buyerPaymentPubkey = userDocument?.paymentPublicKey;
    let buyerOrdinalAddress = userDocument?.ordinalAddress;
    let buyerOrdinalPubkey = userDocument?.ordinalPublicKey;
    depositAmount = Number(depositAmount);
    if (
      buyerPaymentAddress &&
      buyerPaymentPubkey &&
      buyerOrdinalAddress &&
      buyerOrdinalPubkey
    ) {
      const payload: any = await getOrCreateMultiSigWallet(userId);

      if (!payload.success)
        return res.status(500).json({
          success: true,
          msg: "Something went wrong",
        });

      const usedUtxos: string[] = [];

      const generateBuyRunePsbt = await generateBTCSendPsbt(
        walletType,
        payload.wallet.address,
        buyerOrdinalPubkey,
        buyerPaymentPubkey,
        buyerOrdinalAddress,
        depositAmount * 10 ** 8,
        usedUtxos
      );

      const depositData = new depositModel({
        userId: userDocument.userId,
        psbt: generateBuyRunePsbt.toHex(),
        amount: depositAmount,
      });

      const saveTx = await depositData.save();

      return res.status(200).json({
        success: true,
        depositId: saveTx.depositId,
        psbtHex: generateBuyRunePsbt.toHex(),
        psbtBase64: generateBuyRunePsbt.toBase64(),
      });
    } else {
      return res.status(500).json({
        success: true,
        msg: "Something went wrong",
      });
    }
  } catch (error) {
    console.log("Pre Deposit Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Deposit BTC" });
  }
};

export const depositBtc = async (req: Request, res: Response) => {
  try {
    const { userId, depositId, signedPsbt, walletType } = req.body;
    const userDocument = await userModel.findOne({ userId });
    if (!userDocument) {
      return res
        .status(500)
        .json({ success: false, msg: "User doesn't exist" });
    }

    const depositData: any = await depositModel.findOne({ depositId });
    if (!depositData)
      return res
        .status(500)
        .json({ success: false, msg: "Can not find Deposit Data" });

    const txId = await combinePsbt(depositData.psbt, signedPsbt);
    console.log("Deposit Token TxID => ", txId);

    const txDetails = await getTxDetails(txId);
    if (txDetails) {
      let flag = false;
      const payload: any = await getOrCreateMultiSigWallet(userId);
      for (let i = 0; i < txDetails.vout.length; i++) {
        if (
          txDetails.vout[i].scriptpubkey_address == payload.wallet.address &&
          txDetails.vout[i].value == depositData.amount * 10 ** 8
        )
          flag = true;
      }
      if (flag === true) {
        depositData.txId = txId;
        depositData.status = DepositTxStatus.PENDING;
        depositData.signedPSBT = signedPsbt;
        await depositData.save();

        return res.status(200).json({
          success: true,
          msg: "Confirming Deposit Action. Please Wait!",
        });
      } else {
        return res.status(500).json({
          success: false,
          msg: "Error Occurs while Deposit BTC Tokens",
        });
      }
    } else {
      return res
        .status(500)
        .json({ success: false, msg: "Error Occurs while Deposit BTC Tokens" });
    }
  } catch (error) {
    console.log("Buy Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Deposit BTC Tokens" });
  }
};

export const preWithdrawToken = async (req: Request, res: Response) => {
  try {
    let { userId, runeId, amount } = req.body;
    if (!userId || !runeId || !amount) {
      return res.status(500).json({ success: false, msg: "Invalid params" });
    }

    amount = Number(amount);
    const userDocument: any = await userModel.findOne({ userId });
    if (!userDocument) {
      return res
        .status(500)
        .json({ success: false, msg: "User doesn't exist" });
    }

    if (runeId == "btc") {
      amount *= 10 ** 8;
      let sendObj: any = await makeRequest(
        userId, // userId: string
        parseInt(amount), // transferAmount: number,
        userDocument.ordinalAddress, // destinationAddress: string,
        userDocument.ordinalPublicKey, // ordinalAddress: string,
        ADMIN_ORDINAL_ADDRESS // pubKey: string
      );
      return res.status(200).json({
        success: true,
        rune: false,
        ...sendObj,
      });
    } else {
      return res.status(200).json({
        success: true,
        rune: true,
      });
    }
  } catch (error) {
    console.log("Buy Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Buying Rune Tokens" });
  }
};

export const withdrawToken = async (req: Request, res: Response) => {
  try {
    let { userId, runeId, amount, requestId, signedPsbt } = req.body;
    if (!userId || !runeId || !amount) {
      return res.status(500).json({ success: false, msg: "Invalid params" });
    }

    amount = Number(amount);
    const userDocument: any = await userModel.findOne({ userId });
    if (!userDocument) {
      return res
        .status(500)
        .json({ success: false, msg: "User doesn't exist" });
    }

    let saveObj: any = {};

    if (runeId === "btc") {
      // saveObj = {
      //   receiveAddress: userDocument.paymentAddress,
      //   runeName: "",
      //   runeId: "btc",
      //   type: 1,
      //   btcAmount: amount,
      // };

      let requestDocument: any = await requestModel.findOne({ requestId });
      if (!requestDocument) {
        return res.status(500).json({
          success: false,
          msg: "Invalid request id",
        });
      }

      let psbt: string[] = requestDocument.psbt;

      console.log("requestDocument :>> ", requestDocument);
      console.log("signedPsbt :>> ", signedPsbt);
      let adminSignedPsbt: any = await acceptMultisigSignPsbt(signedPsbt);
      adminSignedPsbt = adminSignedPsbt.toHex();
      console.log("adminSignedPsbt :>> ", adminSignedPsbt);
      const savePsbt = [...psbt, signedPsbt, adminSignedPsbt];

      const newRequest = await requestModel.findOneAndUpdate(
        { requestId, psbt }, // filter to find the document
        {
          $set: {
            psbt: savePsbt,
          },
        }, // update operation
        { upsert: true, new: true } // options: upsert = true will create a new document if none is found, new = true will return the updated document
      );

      console.log("newRequest :>> ", newRequest);

      await userModel.updateOne(
        { userId },
        { btcBalance: userDocument.btcBalance - amount }
      );

      amount *= 10 ** 8;
      const txId = await execRequest(newRequest.requestId);
      console.log("txId :>> ", txId);
      const withdrawBtcData = new withdrawModel({
        userId,
        txId,
        btcAmount: amount,
      });
      await withdrawBtcData.save();
    } else {
      const runeDocument = await etchingRuneModel.findOne({ runeId });
      if (!runeDocument) {
        return res
          .status(500)
          .json({ success: false, msg: "Rune doesn't exist" });
      }

      const runeBalanceDocument = await runeBalanceModel.findOne({
        userId,
        runeId,
      });
      if (!runeBalanceDocument || runeBalanceDocument?.balance < amount) {
        return res
          .status(500)
          .json({ success: false, msg: "You don't have enough balance" });
      }
      await runeBalanceModel.updateOne(
        {
          userId,
          runeId,
        },
        {
          balance: runeBalanceDocument.balance - amount,
        }
      );

      amount *= 10 ** runeDocument.divisibility;

      saveObj = {
        receiveAddress: userDocument.paymentAddress,
        runeName: runeDocument.runeName,
        runeId: runeDocument.runeId,
        type: 0,
        runeAmount: amount,
      };
      let txListData = new txListModel(saveObj);
      await txListData.save();
    }

    return res
      .status(200)
      .json({ success: true, msg: "Confirming Claim Action. Please Wait!" });
  } catch (error) {
    console.log("Buy Rune Token Error => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Buying Rune Tokens" });
  }
};

export const getPumpActions = async (req: Request, res: Response) => {
  try {
    let { userId } = req.body;
    console.log("userId :>> ", userId);

    if (!userId) {
      return res.status(500).json({
        success: false,
        msg: `Invalid Parameters`,
      });
    }

    const pumpAction = await pumpActionModel.aggregate([
      {
        $match: { userId: userId },
      },
      {
        $lookup: {
          from: "etchingruneschemas", // The collection name in MongoDB
          localField: "runeId",
          foreignField: "runeId",
          as: "runeInfo",
        },
      },
      {
        $unwind: "$runeInfo",
      },
      {
        $project: {
          _id: 0,
          userId: 1,
          btcAmount: 1,
          runeId: 1,
          runeAmount: 1,
          type: 1,
          status: 1,
          created_at: 1,
          updated_at: 1,
          runeName: "$runeInfo.runeName",
          runeSymbol: "$runeInfo.runeSymbol",
        },
      },
    ]);

    return res.status(200).json({
      success: true,
      pumpAction,
    });
  } catch (error) {
    console.log("error :>> ", error);
    return res.status(500).json({
      success: true,
      msg: `Something went wrong!`,
    });
  }
};

export const pumpPreActionToken = async (
  req: Request,
  res: Response,
  type: number
) => {
  try {
    let { userId, runeId, runeAmount } = req.body;
    console.log("userId, runeId, runeAmount :>> ", userId, runeId, runeAmount);
    if (!userId || !runeId || !runeAmount) {
      return res.status(500).json({
        success: false,
        msg: `Invalid Parameters`,
      });
    }
    const user = await userModel.findOne({ userId });
    if (!user) {
      return res.status(500).json({
        success: false,
        msg: `User doesn't exist.`,
      });
    }
    if (type == 1) {
      const runeInfo = await runeBalanceModel.findOne({ userId, runeId });
      if (!runeInfo) {
        const newRuneInfo = new runeBalanceModel({
          userId,
          runeId,
        });
        await newRuneInfo.save();

        return res.status(500).json({
          success: false,
          msg: `User doesn't have enough rune balance.`,
        });
      }
    }
    const rune = await etchingRuneModel.findOne({ runeId });
    if (!rune) {
      return res.status(500).json({
        success: false,
        msg: `Invalid Rune ID.`,
      });
    }

    const k = rune.runeAmount * rune.initialPrice;
    console.log(
      "k = rune.runeAmount * rune.initialPrice :>> ",
      k,
      rune.runeAmount,
      rune.initialPrice
    );
    let remainAmount = rune.remainAmount;
    if (type == 0) {
      remainAmount -= Number(runeAmount);
    } else {
      remainAmount += Number(runeAmount);
    }
    if (remainAmount == 0) {
      remainAmount = 1;
    }
    console.log("remainAmount :>> ", remainAmount);
    let estimatePrice = k / remainAmount;
    let sendData: any = {
      success: true,
      estimatePrice,
    };

    if (type == 0) {
      const requestData = await makeRequest(
        userId, // userId: string
        parseInt(`${estimatePrice * SAT_DECIMAL}`), // transferAmount: number,
        ADMIN_PAYMENT_ADDRESS, // destinationAddress: string,
        ADMIN_ORDINAL_ADDRESS, // ordinalAddress: string,
        user.ordinalPublicKey // pubKey: string
      );

      sendData = {
        ...sendData,
        requestData,
      };
    }
    return res.status(200).json(sendData);
  } catch (error) {
    console.log("error :>> ", error);
    return res.status(500).json({
      success: true,
      msg: `Something went wrong!`,
    });
  }
};

export const pumpBuyActionToken = async (req: Request, res: Response) => {
  try {
    let { userId, runeId, runeAmount, btcAmount, requestId, signedPsbt } =
      req.body;

    console.log(
      "Buy => userId, runeId, runeAmount, btcAmount: ",
      userId,
      runeId,
      runeAmount,
      btcAmount
    );
    if (
      !userId ||
      !runeId ||
      !runeAmount ||
      !btcAmount ||
      !requestId ||
      !signedPsbt
    ) {
      return res.status(500).json({
        success: false,
        msg: "Invalid parameters",
      });
    }
    runeAmount = Number(runeAmount);

    let user = await userModel.findOne({ userId });
    if (!user) {
      return res.status(500).json({
        success: false,
        msg: "Invalid user id",
      });
    }

    // console.log("user :>> ", user);
    if (user.btcBalance < btcAmount) {
      return res.status(500).json({
        success: false,
        msg: "User doesn't have enough balance",
      });
    }

    let rune = await etchingRuneModel.findOne({ runeId });
    if (!rune) {
      return res.status(500).json({
        success: false,
        msg: "Invalid rune id",
      });
    }
    // console.log("rune :>> ", rune);
    if (rune.remainAmount < runeAmount) {
      return res.status(500).json({
        success: false,
        msg: "There is no available rune amount in the dex",
      });
    }

    let requestDocument: any = await requestModel.findOne({ requestId });
    if (!requestDocument) {
      return res.status(500).json({
        success: false,
        msg: "Invalid request id",
      });
    }

    let psbt: string[] = requestDocument.psbt;

    console.log("requestDocument :>> ", requestDocument);
    console.log("signedPsbt :>> ", signedPsbt);
    let adminSignedPsbt: any = await acceptMultisigSignPsbt(signedPsbt);
    adminSignedPsbt = adminSignedPsbt.toHex();
    console.log("adminSignedPsbt :>> ", adminSignedPsbt);
    const savePsbt = [...psbt, signedPsbt, adminSignedPsbt];

    const newRequest = await requestModel.findOneAndUpdate(
      { requestId, psbt }, // filter to find the document
      {
        $set: {
          psbt: savePsbt,
        },
      }, // update operation
      { upsert: true, new: true } // options: upsert = true will create a new document if none is found, new = true will return the updated document
    );

    console.log("newRequest :>> ", newRequest);

    const txId = await execRequest(newRequest.requestId);
    console.log("txId :>> ", txId);

    const pumpAction = new pumpActionModel({
      userId,
      btcAmount,
      runeId,
      runeAmount,
      txId,
      type: 0,
    });

    await pumpAction.save();

    return res.status(200).json({
      success: true,
      msg: `Confirming pump Buy Rune Action. Please Wait!`,
    });
  } catch (error) {
    console.log("error :>> ", error);
    return res.status(500).json({
      success: true,
      msg: `Something went wrong!`,
    });
  }
};

export const pumpSellActionToken = async (req: Request, res: Response) => {
  try {
    let { userId, runeId, runeAmount, btcAmount, messageData } = req.body;
    console.log(
      "Sell => userId, runeId, runeAmount, btcAmount: ",
      userId,
      runeId,
      runeAmount,
      btcAmount
    );
    if (!userId || !runeId || !runeAmount || !btcAmount) {
      return res.status(500).json({
        success: false,
        msg: "Invalid parameters",
      });
    }
    btcAmount = Number(btcAmount);
    runeAmount = Number(runeAmount);
    const runeBalanceInfo = await RuneInfoOrCreat(userId, runeId);

    if (!runeBalanceInfo || runeBalanceInfo?.balance < runeAmount) {
      return res.status(500).json({
        success: false,
        msg: "You don't have enough rune",
      });
    }

    let user = await userModel.findOne({ userId });
    if (!user) {
      return res.status(500).json({
        success: false,
        msg: "Invalid user id",
      });
    }
    // console.log("user :>> ", user);
    const { signature, message } = messageData;
    const result = verifyMessage(user.paymentPublicKey, message, signature);
    console.log("result ::> ", result);
    if (result) {
      let rune = await etchingRuneModel.findOne({ runeId });
      if (!rune) {
        return res.status(500).json({
          success: false,
          msg: "Invalid rune id",
        });
      }
      // console.log("rune :>> ", rune);

      await userModel.findOneAndUpdate(
        { userId },
        {
          btcBalance: user.btcBalance + btcAmount,
        }
      );
      await etchingRuneModel.findOneAndUpdate(
        {
          runeId,
        },
        {
          remainAmount: rune.remainAmount + runeAmount,
        }
      );
      await runeBalanceModel.findOneAndUpdate(
        { userId, runeId },
        {
          balance: runeBalanceInfo.balance - runeAmount,
        }
      );

      const pumpAction = new pumpActionModel({
        userId,
        btcAmount,
        runeId,
        runeAmount,
        type: 1,
      });

      await pumpAction.save();

      return res.status(200).json({
        success: true,
        msg: `Confirming pump Buy Rune Action. Please Wait!`,
      });
    } else {
      return res.status(500).json({
        success: true,
        msg: `Something went wrong on verification message!`,
      });
    }
  } catch (error) {
    console.log("error :>> ", error);
    return res.status(500).json({
      success: true,
      msg: `Something went wrong!`,
    });
  }
};
