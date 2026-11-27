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
        Text("Boost")
          .foregroundStyle(.secondary)
          .accessibilityHidden(true) // the switch says it
        Toggle("Boost", isOn: Binding(get: { model.isOn }, set: { model.toggle($0) }))
          .toggleStyle(.switch)
          .controlSize(.small)
          .tint(.orange)
          .labelsHidden()
          .popoverPart(.boostSwitch)
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

      // The Control Center look: a small sun, a thin track that fills from the left with no knob, a big sun.
      HStack(spacing: 8) {
        Image(systemName: "sun.min").font(.system(size: 11)).accessibilityHidden(true)
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
          label: { Text("Brightness") },
          onEditingChanged: { editing in if !editing { dragged = nil } }
        )
        .labelsHidden()
        .knobless()
        .tint(.primary)
        .accessibilityValue("\(model.shownLevel)%")
        .popoverPart(.slider)
        Image(systemName: "sun.max").font(.system(size: 16)).accessibilityHidden(true)
      }
      .foregroundStyle(.secondary)

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
    .coordinateSpace(name: PopoverPart.space)
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
      if let level = model.menuBarLevel {
        Text("\(level)%").monospacedDigit()
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

extension View {
  /// A slider without its knob, where the system has one (macOS 26 and later); the plain slider before.
  @ViewBuilder func knobless() -> some View {
    if #available(macOS 26, *) {
      sliderThumbVisibility(.hidden)
    } else {
      self
    }
  }
}

/// The parts of the popover that boost-check's pictures point at, with their frames in points from the popover's
/// top-left corner (`onPreferenceChange(PopoverPart.Frames.self)`).
public enum PopoverPart: Hashable, Sendable {
  case boostSwitch
  case slider

  static let space = "popover"

  public struct Frames: PreferenceKey {
    public static let defaultValue: [PopoverPart: CGRect] = [:]
    public static func reduce(value: inout [PopoverPart: CGRect], nextValue: () -> [PopoverPart: CGRect]) {
      value.merge(nextValue()) { $1 }
    }
  }
}

extension View {
  func popoverPart(_ part: PopoverPart) -> some View {
    background(GeometryReader { proxy in
      Color.clear.preference(key: PopoverPart.Frames.self, value: [part: proxy.frame(in: .named(PopoverPart.space))])
    })
  }
}
