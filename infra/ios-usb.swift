import Foundation
import XPC

xpc_set_event_stream_handler("com.apple.iokit.matching", .main) { _ in }
let task = Process()
task.executableURL = URL(fileURLWithPath: "/bin/bash")
task.arguments = Array(CommandLine.arguments.dropFirst())
task.terminationHandler = { exit($0.terminationStatus) }
try task.run()
dispatchMain()
