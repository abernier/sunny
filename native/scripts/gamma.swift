// Prints the main display's gamma table in short: its top sample per channel, and whether it is the
// identity ramp. A check for the boost: above 1.0 while boosted, back to the ColorSync table after.
//   swift scripts/gamma.swift
import CoreGraphics

let size: UInt32 = 256
var red = [CGGammaValue](repeating: 0, count: Int(size))
var green = red
var blue = red
var count: UInt32 = 0
CGGetDisplayTransferByTable(CGMainDisplayID(), size, &red, &green, &blue, &count)
let n = Int(count)
let identity = (0..<n).allSatisfy { i in
  let expected = Float(i) / Float(max(1, n - 1))
  return [red[i], green[i], blue[i]].allSatisfy { abs($0 - expected) < 0.002 }
}
print("samples \(n) top r \(red[n - 1]) g \(green[n - 1]) b \(blue[n - 1]) mid r \(red[n / 2]) identity \(identity)")
