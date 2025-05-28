import * as Bitcoin from "bitcoinjs-lib";
import { type Taptree } from "bitcoinjs-lib/src/types";
import * as ecc from "tiny-secp256k1";
import { type Request, type Response } from "express";
import axios from "axios";
import { EtchInscription, getSpacersVal } from "runelib";
import { LocalWallet } from "../service/localWallet";
import {
  testVersion,
  ORDINAL_RECEIVE_VALUE,
  ADMIN_ORDINAL_ADDRESS,
  ADMIN_PAYMENT_ADDRESS,
} from "../config/config";
import { TxStatus } from "../config/constant";
import { toXOnly } from "../service/utils.service";
import {
  inscribeImagePSBT,
  inscribeRunePSBT,
  broadcastPSBT,
  broadcastTapscriptPSBT,
} from "../service/psbt.service";
import { finalizePsbtInput, waitUntilUTXO } from "../service/psbt.utils";
import { sendBTC } from "../service/unisat.service";
import etchingRuneModel from "../model/etchingRuneModel";
import { getBlockHeight, getFeeRate, getTxStatus } from "../service/mempool";
import { delay } from "../service/utils.service";
import { OPENAPI_UNISAT_TOKEN, OPENAPI_UNISAT_URL } from "../config/config";
import depositModel from "../model/depositModel";
import userModel from "../model/userModel";
import requestModel from "../model/requestModel";
import { execRequest, makeRequest } from "./nativeMusig.controller";
import { acceptMultisigSignPsbt } from "../service/multisig.service";
import waitEtchingModel from "../model/waitEtchingModel";

Bitcoin.initEccLib(ecc);
const network = testVersion
  ? Bitcoin.networks.testnet
  : Bitcoin.networks.bitcoin;

const key = process.env.ADMIN_PRIVATE_KEY;
if (typeof key !== "string" || key === "") {
  throw new Error(
    "Environment variable PRIVATE_KEY must be set and be a valid string."
  );
}
export const wallet = new LocalWallet(key, testVersion ? 1 : 0);

const dummyUtxo = [
  {
    txid: "bbca2238117d6671f40f4efe5f2c6bb111dd60b589c6e72689fcab17798e7049",
    vout: 0,
    status: {
      confirmed: true,
      block_height: 2818544,
      block_hash:
        "0000000000000002975bc6dfde352d035e3fc6e5240219bf55bd12c892c5184b",
      block_time: 1716981277,
    },
    value: 27750,
  },
];

const splitBuffer = (buffer: Buffer, chunkSize: number) => {
  let chunks = [];
  for (let i = 0; i < buffer.length; i += chunkSize) {
    const chunk = buffer.subarray(i, i + chunkSize);
    chunks.push(chunk);
  }
  return chunks;
};

const createInscriptionTapScript = (imageString: string): Array<Buffer> => {
  let childOrdinalStacks: any = [
    toXOnly(Buffer.from(wallet.pubkey, "hex")),
    Bitcoin.opcodes.OP_CHECKSIG,
    Bitcoin.opcodes.OP_FALSE,
    Bitcoin.opcodes.OP_IF,
    Buffer.from("ord", "utf8"),
    1,
    1,
    Buffer.concat([Buffer.from("image/png", "utf8")]),
    Bitcoin.opcodes.OP_0,
  ];

  const contentBufferData: Buffer = Buffer.from(imageString, "hex");
  const contentBufferArray: Array<Buffer> = splitBuffer(contentBufferData, 400);

  contentBufferArray.forEach((item: Buffer) => {
    childOrdinalStacks.push(item);
  });

  childOrdinalStacks.push(Bitcoin.opcodes.OP_ENDIF);

  return childOrdinalStacks;
};

const imageEtching = async (userInfo: any, imageString: string) => {
  try {
    const ordinalStack = createInscriptionTapScript(imageString);
    const ordinal_script = Bitcoin.script.compile(ordinalStack);

    const scriptTree: Taptree = { output: ordinal_script };

    const redeem = {
      output: ordinal_script,
      redeemVersion: 192,
    };

    const ordinal_p2tr = Bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(wallet.pubkey, "hex")),
      network,
      scriptTree,
      redeem,
    });

    const address = ordinal_p2tr.address ?? "";
    if (address === "") {
      console.log("Can Not Get Inscription Address");
      return "";
    }

    const feeRate = await getFeeRate();

    const generateDummyImagePsbt = await inscribeImagePSBT(
      dummyUtxo,
      ordinal_p2tr,
      redeem,
      wallet.address
    );
    const dummyDataVB = await finalizePsbtInput(generateDummyImagePsbt.toHex());
    const calcTxFee = dummyDataVB.virtualSize() * feeRate;
    const fee = Number(calcTxFee + ORDINAL_RECEIVE_VALUE) / 10 ** 8;
    console.log("= = = balance = = =");
    console.log(userInfo.btcBalance, fee);

    if (userInfo.btcBalance < fee) {
      return null;
    }

    await userModel.updateOne(
      { userId: userInfo.userId },
      { btcBalance: userInfo.btcBalance - fee }
    );

    await sendBTC(calcTxFee + ORDINAL_RECEIVE_VALUE, address);

    await delay(5000);

    const utxos = await waitUntilUTXO(address);
    const utxo = utxos.filter(
      (utxo) => utxo.value === calcTxFee + ORDINAL_RECEIVE_VALUE
    );

    const generateImagePsbt = await inscribeImagePSBT(
      utxo,
      ordinal_p2tr,
      redeem,
      wallet.address
    );

    const generateImageTxId = await broadcastPSBT(generateImagePsbt.toHex());

    return generateImageTxId;
  } catch (error) {
    console.log("While Etching Image => ", error);
    return "";
  }
};

export const etchingRuneToken = async (
  runeName: string,
  runeAmount: number,
  runeSymbol: string,
  imageTxId: string,
  initialPrice: string,
  creatorAddress: string
) => {
  try {
    const name = runeName.replaceAll(".", "•");
    const originalName = runeName.replaceAll(".", "").toLocaleUpperCase();
    const spacers = getSpacersVal(name);
    console.log(originalName);
    console.log(spacers);

    const ins = new EtchInscription();
    const HTMLContent = `<!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Build Your Own Recursive Ordinal</title>
      </head>
      <body style="margin: 0px">
        <div>
          <img style="width:100%;margin:0px" src=${`/content/${imageTxId}i0`} />
        </div>
      </body>
    </html>`;

    ins.setContent(
      "text/html;charset=utf-8",
      Buffer.from(HTMLContent, "utf-8")
    );
    ins.setRune(originalName);

    const etching_script_asm = `${toXOnly(
      Buffer.from(wallet.pubkey, "hex")
    ).toString("hex")} OP_CHECKSIG`;

    const etching_script = Buffer.concat([
      Bitcoin.script.fromASM(etching_script_asm),
      ins.encipher(),
    ]);

    const scriptTree: Taptree = {
      output: etching_script,
    };

    const script_p2tr = Bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(wallet.pubkey, "hex")),
      scriptTree,
      network,
    });

    const etching_redeem = {
      output: etching_script,
      redeemVersion: 192,
    };

    const etching_p2tr = Bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(wallet.pubkey, "hex")),
      scriptTree,
      redeem: etching_redeem,
      network,
    });

    const address = script_p2tr.address ?? "";
    if (address === "") {
      console.log("Can Not Get Inscription Address");
      return "";
    }

    const feeRate = await getFeeRate();
    const generateDummyInscribePSBT = await inscribeRunePSBT(
      dummyUtxo,
      script_p2tr,
      etching_p2tr,
      etching_redeem,
      wallet.address,
      runeSymbol,
      runeAmount,
      originalName,
      spacers
    );
    const dummyDataVB = await finalizePsbtInput(
      generateDummyInscribePSBT.toHex()
    );
    const calcTxFee = dummyDataVB.virtualSize() * feeRate;

    const sendBTCTxId = await sendBTC(
      calcTxFee + ORDINAL_RECEIVE_VALUE,
      address
    );

    await delay(5000);

    const utxos = await waitUntilUTXO(address);
    const utxo = utxos.filter(
      (utxo) => utxo.value === calcTxFee + ORDINAL_RECEIVE_VALUE
    );

    const generateInscribePSBT = await inscribeRunePSBT(
      utxo,
      script_p2tr,
      etching_p2tr,
      etching_redeem,
      wallet.address,
      runeSymbol,
      runeAmount,
      originalName,
      spacers
    );

    const newRuneEtching = new etchingRuneModel({
      sendBTCTxId: sendBTCTxId,
      runeName: runeName,
      runeSymbol: runeSymbol,
      initialPrice: Number(initialPrice) / 10 ** 8,
      creatorAddress: creatorAddress,
      runeAmount: runeAmount,
      remainAmount: runeAmount,
      psbt: generateInscribePSBT.toHex(),
    });
    await newRuneEtching.save();

    return;
  } catch (error) {
    console.log("Error occurs while etching rune token => ", error);
    throw error;
  }
};

export const PreCreateRuneToken = async (req: Request, res: Response) => {
  try {
    const { userId, imageString, runeSymbol, runeName } = req.body;

    const userInfo = await userModel.findOne({ userId });
    if (!userInfo) {
      return res
        .status(500)
        .json({ success: false, msg: "User doesn't exist" });
    }

    const filterName = await etchingRuneModel.findOne({
      runeName: runeName,
    });

    if (filterName)
      return res
        .status(400)
        .json({ success: false, msg: "Rune Name Already Exist" });

    // const imageEtchingTxId = await imageEtching(userInfo, imageString);

    const ordinalStack = createInscriptionTapScript(imageString);
    const ordinal_script = Bitcoin.script.compile(ordinalStack);

    const scriptTree: Taptree = { output: ordinal_script };

    const redeem = {
      output: ordinal_script,
      redeemVersion: 192,
    };

    const ordinal_p2tr = Bitcoin.payments.p2tr({
      internalPubkey: toXOnly(Buffer.from(wallet.pubkey, "hex")),
      network,
      scriptTree,
      redeem,
    });

    const address = ordinal_p2tr.address ?? "";
    if (address === "") {
      console.log("Can Not Get Inscription Address");
      return "";
    }

    const feeRate = await getFeeRate();

    const generateDummyImagePsbt = await inscribeImagePSBT(
      dummyUtxo,
      ordinal_p2tr,
      redeem,
      wallet.address
    );
    const dummyDataVB = await finalizePsbtInput(generateDummyImagePsbt.toHex());
    const calcTxFee = dummyDataVB.virtualSize() * feeRate;
    const fee = Number(calcTxFee + ORDINAL_RECEIVE_VALUE) / 10 ** 8;

    console.log("123 = = = balance = = = 123");
    console.log(userInfo.btcBalance, fee);

    if (userInfo.btcBalance < fee) {
      return null;
    }

    const etchingPsbt = await makeRequest(
      userId,
      Number(calcTxFee + ORDINAL_RECEIVE_VALUE), //transferAmount: number,
      ADMIN_PAYMENT_ADDRESS, // destinationAddress: string,
      ADMIN_ORDINAL_ADDRESS, // ordinalAddress: string,
      userInfo.ordinalPublicKey // pubKey: string
    );

    console.log("etchingPsbt :>> ", etchingPsbt);

    const etchingData = new waitEtchingModel({
      userId,
      runeName,
      runeSymbol,
      fee,
      calcTxFee,
      address,
      ordinal_p2tr,
      redeem,
    });

    await etchingData.save();

    console.log("etchingData :>> ", etchingData);

    return res.status(200).json({
      success: true,
      etchingPsbt,
      msg: "It's in pending. Please Wait while check your wallet",
    });
  } catch (error) {
    console.log("While Create Rune Token => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Etching Rune Tokens" });
  }
};

export const createRuneToken = async (req: Request, res: Response) => {
  try {
    const {
      userId,
      signedPsbt,
      requestId,
    } = req.body;

    const userInfo = await userModel.findOne({ userId });
    if (!userInfo) {
      return res
        .status(500)
        .json({ success: false, msg: "User doesn't exist" });
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

    return res.status(200).json({
      success: true,
      msg: "It's in pending. Please Wait while check your wallet",
    });
  } catch (error) {
    console.log("While Create Rune Token => ", error);
    return res
      .status(500)
      .json({ success: false, msg: "Error Occurs while Etching Rune Tokens" });
  }
};

export const getRunes = async (req: Request, res: Response) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(500).json({
      success: false,
      msg: "Please send userId",
    });
  }
  const user = await userModel.findOne({ userId });
  if (!user) {
    return res.status(500).json({
      success: false,
      msg: "User ID is invalid.",
    });
  }

  const runes = await etchingRuneModel.aggregate([
    {
      $lookup: {
        from: "runebalanceschemas", // The collection name in MongoDB
        let: { runeId: "$runeId" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$runeId", "$$runeId"] },
                  { $eq: ["$userId", userId] }, // Match the userId within the lookup
                ],
              },
            },
          },
        ],
        as: "runeBalanceInfo",
      },
    },
    {
      $unwind: {
        path: "$runeBalanceInfo",
        preserveNullAndEmptyArrays: true, // Keep documents even if there is no match
      },
    },
    {
      $project: {
        _id: 0,
        runeName: 1,
        runeSymbol: 1,
        runeId: 1,
        runeAmount: 1,
        remainAmount: 1,
        initialPrice: 1,
        balance: "$runeBalanceInfo.balance",
      },
    },
  ]);

  // const runes = await etchingRuneModel.find({});

  res.status(200).json({
    success: true,
    runes,
  });
};
