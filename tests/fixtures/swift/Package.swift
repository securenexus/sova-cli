// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "MySwiftPackage",
    products: [
        .library(name: "MySwiftPackage", targets: ["MySwiftPackage"]),
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-nio.git", from: "2.65.0"),
        .package(url: "https://github.com/vapor/vapor.git", .upToNextMajor(from: "4.89.0")),
        .package(url: "https://github.com/nicklockwood/SwiftyJSON.git", exact: "5.0.1"),
    ],
    targets: [
        .target(
            name: "MySwiftPackage",
            dependencies: [
                .product(name: "NIO", package: "swift-nio"),
                .product(name: "Vapor", package: "vapor"),
                "SwiftyJSON",
            ]
        ),
    ]
)
