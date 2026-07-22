import UIKit
import Capacitor

// MOB-S1 — Sabit kabuk: belge-seviyesi kaydırma tamamen native'de kapatılır.
// Web tarafı (index.css) html/body'yi kilitler; burada da WKWebView'ın dış
// UIScrollView'ının zıplaması (rubber-band) ve zemin rengi sabitlenir. Böylece
// hangi ekranda olursa olsun üst/altta beyaz native katman ASLA görünemez.
// Main.storyboard bu sınıfı kullanır (customClass="OYNAViewController").
// AppDelegate.swift içinde tanımlı olması bilinçli: yeni .swift dosyası
// eklemek project.pbxproj değişikliği gerektirirdi.
class OYNAViewController: CAPBridgeViewController {
    override func viewDidLoad() {
        super.viewDidLoad()
        let oynaDark = UIColor(red: 0x0A / 255.0, green: 0x0E / 255.0, blue: 0x14 / 255.0, alpha: 1.0)
        view.backgroundColor = oynaDark
        webView?.backgroundColor = oynaDark
        webView?.isOpaque = false
        webView?.scrollView.backgroundColor = oynaDark
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Override point for customization after application launch.
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {
        // Sent when the application is about to move from active to inactive state. This can occur for certain types of temporary interruptions (such as an incoming phone call or SMS message) or when the user quits the application and it begins the transition to the background state.
        // Use this method to pause ongoing tasks, disable timers, and invalidate graphics rendering callbacks. Games should use this method to pause the game.
    }

    func applicationDidEnterBackground(_ application: UIApplication) {
        // Use this method to release shared resources, save user data, invalidate timers, and store enough application state information to restore your application to its current state in case it is terminated later.
        // If your application supports background execution, this method is called instead of applicationWillTerminate: when the user quits.
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Called as part of the transition from the background to the active state; here you can undo many of the changes made on entering the background.
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Restart any tasks that were paused (or not yet started) while the application was inactive. If the application was previously in the background, optionally refresh the user interface.
    }

    func applicationWillTerminate(_ application: UIApplication) {
        // Called when the application is about to terminate. Save data if appropriate. See also applicationDidEnterBackground:.
    }

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        // Called when the app was launched with a url. Feel free to add additional processing here,
        // but if you want the App API to support tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        // Called when the app was launched with an activity, including Universal Links.
        // Feel free to add additional processing here, but if you want the App API to support
        // tracking app url opens, make sure to keep this call
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }

    // @capacitor/push-notifications: APNs cihaz token'ını JS katmanına iletir.
    // Bu iki metod olmadan PushNotifications.register() hiçbir zaman 'registration'
    // olayını tetiklemez ve push token Supabase'e kaydedilemez.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }

}
