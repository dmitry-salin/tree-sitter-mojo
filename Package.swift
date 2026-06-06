// swift-tools-version:5.3

import Foundation
import PackageDescription

let package = Package(
    name: "TreeSitterMojo",
    products: [
        .library(name: "TreeSitterMojo", targets: ["TreeSitterMojo"]),
    ],
    dependencies: [
        .package(name: "SwiftTreeSitter", url: "https://github.com/tree-sitter/swift-tree-sitter", from: "0.10.0"),
    ],
    targets: [
        .target(
            name: "TreeSitterMojo",
            dependencies: [],
            path: ".",
            sources: ["src/parser.c", "src/scanner.c"],
            resources: [
                .copy("queries")
            ],
            publicHeadersPath: "bindings/swift",
            cSettings: [.headerSearchPath("src")]
        ),
        .testTarget(
            name: "TreeSitterMojoTests",
            dependencies: [
                .product(name: "SwiftTreeSitter", package: "swift-tree-sitter"),
                "TreeSitterMojo",
            ],
            path: "bindings/swift/TreeSitterMojoTests"
        )
    ],
    cLanguageStandard: .c11
)
