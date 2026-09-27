/**
 * iOS 27 terminates apps at launch unless they adopt the UIScene life cycle
 * (UIKit: _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
 *
 * Expo SDK 57 ships ExpoAppSceneDelegate for this, but its prebuild template
 * doesn't wire it up yet. This plugin:
 *  1. declares the scene delegate in Info.plist (UIApplicationSceneManifest)
 *  2. makes AppDelegate conform to ExpoReactNativeFactoryProvider
 *  3. stops AppDelegate creating its own window — the scene delegate now
 *     creates the window and starts React Native into it.
 *
 * Remove once `expo prebuild` generates this itself.
 */
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE_CLASS = 'EXExpoAppSceneDelegate'; // @objc name of ExpoAppSceneDelegate

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE_CLASS,
          },
        ],
      },
    };
    return cfg;
  });
}

function replaceOnce(src, search, replacement, what) {
  if (!src.includes(search)) {
    throw new Error(
      `with-scene-lifecycle: couldn't find ${what} in AppDelegate.swift. ` +
        'The Expo template changed — check whether prebuild now handles scenes and remove this plugin.',
    );
  }
  return src.replace(search, replacement);
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle only supports a Swift AppDelegate');
    }
    let src = cfg.modResults.contents;
    if (src.includes('ExpoReactNativeFactoryProvider')) return cfg; // already applied

    src = replaceOnce(
      src,
      'class AppDelegate: ExpoAppDelegate {',
      'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {',
      'the AppDelegate class declaration',
    );

    // The scene delegate owns the window and starts React Native.
    src = src.replace(
      /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/,
      '\n    // Window + React Native start-up happen in ExpoAppSceneDelegate (UIScene life cycle).\n',
    );
    if (src.includes('factory.startReactNative(')) {
      throw new Error("with-scene-lifecycle: couldn't remove the AppDelegate window setup; the Expo template changed.");
    }

    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = function withSceneLifecycle(config) {
  return withSceneAppDelegate(withSceneManifest(config));
};
