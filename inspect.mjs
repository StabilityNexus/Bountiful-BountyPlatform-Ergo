
import { ErgoTree, SConstant } from "@fleet-sdk/core";
import { hex } from "@fleet-sdk/crypto";

const template = "1001040004000e20d193ddf390830400d801d601d6028c0202d603b2a5730000d604b2a5730100d605b2a5730200d606b2a5730300";
const ergoTree = ErgoTree.fromHex(template);

const newTree = ergoTree.withConstant(0, SConstant(123));

console.log(newTree.toHex());
