import Foundation
import Wabridge

/**
 * WabridgeModule — React Native NativeModule wrapping the Go Wabridge.xcframework.
 *
 * The xcframework is compiled via:
 *   gomobile bind -target=ios -o ios/Wabridge.xcframework .
 * from packages/wabridge/.
 *
 * Gomobile's ObjC API uses NSError** for errors; Swift bridges these as throws.
 */
@objc(Wabridge)
class WabridgeModule: NSObject {

  private var bridge: WabridgeBridge?

  // MARK: - initBridge

  @objc func initBridge(
    _ dbPath: String,
    authToken: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        var error: NSError?
        guard let b = WabridgeNewBridge(dbPath, authToken, &error) else {
          throw error ?? NSError(domain: "Wabridge", code: -1,
            userInfo: [NSLocalizedDescriptionKey: "Failed to init bridge"])
        }
        self.bridge = b
        resolve(nil)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - startPairing

  @objc func startPairing(
    _ phoneNumber: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let b = self.bridge else {
          throw Self.notInitializedError()
        }
        let code = try b.startPairing(phoneNumber)
        resolve(code)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - isLinked

  @objc func isLinked(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      guard let b = self.bridge else {
        resolve(false)
        return
      }
      resolve(b.isLinked())
    }
  }

  // MARK: - syncAndTriage

  @objc func syncAndTriage(
    _ lastSyncTimestamp: Double,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .background).async {
      do {
        guard let b = self.bridge else { throw Self.notInitializedError() }

        let callback = MessageCallbackImpl { _ in /* JS polls getMatches */ }
        guard let result = try b.syncAndTriage(Int64(lastSyncTimestamp), callback: callback) else {
          resolve(["messagesSynced": 0, "error": ""])
          return
        }
        resolve(["messagesSynced": result.messagesSynced, "error": result.error])
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - getFilters

  @objc func getFilters(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let b = self.bridge else { throw Self.notInitializedError() }
        let json = try b.getFilters()
        resolve(json)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - saveFilter

  @objc func saveFilter(
    _ filterJson: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let b = self.bridge else { throw Self.notInitializedError() }
        let json = try b.saveFilter(filterJson)
        resolve(json)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - deleteFilter

  @objc func deleteFilter(
    _ id: String,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let b = self.bridge else { throw Self.notInitializedError() }
        try b.deleteFilter(id)
        resolve(nil)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - getMatches

  @objc func getMatches(
    _ filterId: String,
    limit: Int,
    resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let b = self.bridge else { throw Self.notInitializedError() }
        let json = try b.getMatches(filterId, limit: Int(limit))
        resolve(json)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - unlink

  @objc func unlink(
    _ resolve: @escaping RCTPromiseResolveBlock,
    reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        guard let b = self.bridge else { throw Self.notInitializedError() }
        try b.unlink()
        self.bridge = nil
        resolve(nil)
      } catch {
        reject("WABRIDGE_ERROR", error.localizedDescription, error)
      }
    }
  }

  // MARK: - helpers

  static func notInitializedError() -> NSError {
    NSError(domain: "Wabridge", code: -1, userInfo: [
      NSLocalizedDescriptionKey: "Wabridge not initialized. Call initBridge(dbPath, authToken) first."
    ])
  }
}

// MARK: - MessageCallback

/// Concrete implementation of WabridgeMessageCallback protocol for gomobile.
private class MessageCallbackImpl: NSObject, WabridgeMessageCallbackProtocol {
  private let handler: (String) -> Void
  init(_ handler: @escaping (String) -> Void) { self.handler = handler }
  func onMessage(_ jsonPayload: String?) { handler(jsonPayload ?? "") }
}
