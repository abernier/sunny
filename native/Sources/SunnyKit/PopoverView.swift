// The popover under the menu bar icon: the switch, the level with "-" and "+", the slider, open at login, quit.
import AppKit
import SunnyCore
import SwiftUI

public struct PopoverView: View {
  @ObservedObject var model: SunnyModel

  public init(model: SunnyModel) { self.model = model }
  /// While the thumb is dragged the slider keeps its own position, not the one rounded to a whole level.
  @State private var dragged: Double?

  public var body: some View {
    VStack(alignment: .leading, spacing: 12) {
      HStack {
        Text("Sunny").font(.system(size: 13, weight: .semibold))
        Spacer()
        Toggle("Boost", isOn: Binding(get: { model.isOn }, set: { model.toggle($0) }))
          .toggleStyle(.switch)
          .controlSize(.small)
          .tint(.orange)
          .foregroundStyle(.secondary)
      }

      HStack {
        Button("−") { model.step(-1) }
          .buttonStyle(RoundButtonStyle())
          .disabled(model.shownLevel <= Level.min)
          .accessibilityLabel("Dimmer (divide by 1.1)")
        Spacer()
        (Text("\(model.shownLevel)").font(.system(size: 36, weight: .semibold))
          + Text("%").font(.system(size: 20)).foregroundColor(.secondary))
          .monospacedDigit()
          .accessibilityLabel("\(model.shownLevel)%")
        Spacer()
        Button("+") { model.step(1) }
          .buttonStyle(RoundButtonStyle())
          .disabled(model.shownLevel >= Level.max)
          .accessibilityLabel("Brighter (multiply by 1.1)")
      }

      Slider(
        value: Binding(
          get: { dragged ?? SliderScale.position(of: model.shownLevel) },
          set: { position in
            let snapped = (position / SliderScale.fineStep).rounded() * SliderScale.fineStep
            dragged = snapped
            model.set(SliderScale.level(at: snapped))
          }
        ),
        in: 0...SliderScale.end,
        onEditingChanged: { editing in if !editing { dragged = nil } }
      )
      .tint(.orange)
      .accessibilityLabel("Brightness")
      .accessibilityValue("\(model.shownLevel)%")

      Divider()

      HStack {
        if let atLogin = model.openAtLogin {
          Toggle("Open at login", isOn: Binding(get: { atLogin }, set: { model.setOpenAtLogin($0) }))
            .toggleStyle(.switch)
            .controlSize(.mini)
        }
        Spacer()
        Button("Quit") { model.quit() }
          .buttonStyle(.borderless)
      }
      .font(.system(size: 12))
      .foregroundStyle(.secondary)
    }
    .padding(.horizontal, 16)
    .padding(.top, 12)
    .padding(.bottom, 10)
    .frame(width: 300)
  }
}

/// The round "-" and "+" buttons.
private struct RoundButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.system(size: 18))
      .frame(width: 32, height: 32)
      .background(Circle().fill(Color.primary.opacity(configuration.isPressed ? 0.2 : 0.1)))
      .contentShape(Circle())
      .opacity(isEnabled ? 1 : 0.4)
  }
}

/// The menu bar icon, with the level beside it while boosted.
public struct MenuBarLabel: View {
  @ObservedObject var model: SunnyModel

  public init(model: SunnyModel) { self.model = model }

  public var body: some View {
    HStack(spacing: 4) {
      Image(nsImage: Self.icon)
      if model.isOn {
        Text("\(model.level)%")
      }
    }
  }

  /// The sun the app carries (a template image, drawn in the menu bar's color), or a system one without a bundle.
  static let icon: NSImage = {
    let image = Bundle.main.image(forResource: "MenuBarIconTemplate")
      ?? NSImage(systemSymbolName: "sun.max", accessibilityDescription: "Sunny")
      ?? NSImage()
    image.isTemplate = true
    return image
  }()
}
