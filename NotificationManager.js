const { BrowserWindow, screen, Notification, app } = require('electron');
const path = require('path');

class NotificationManager {
  constructor() {
    this.queue = [];
    this.activeNotifications = []; // { id, win, timeout }
    this.maxVisible = 3;
    this.width = 320;
    this.height = 100;
    this.margin = 0;
    this.autoCloseMs = 30000; // 30 seconds auto-close
  }

  enqueueOS(nativeOpts) {
    if (nativeOpts && Notification.isSupported()) {
      const notificationParams = {
        title: nativeOpts.title || 'Topluyo',
        body: nativeOpts.body || '',
      };
      if (nativeOpts.icon) {
        notificationParams.icon = nativeOpts.icon;
      } else {
        notificationParams.icon = path.join(app.getAppPath(), "topluyo.png");
      }

      const nativeNotif = new Notification(notificationParams);
      nativeNotif.show();
    }
  }

  enqueue(iframeUrl) {
    if (!iframeUrl) return;

    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5);
    this.queue.push({ id, iframeUrl });
    this.processQueue();
  }

  processQueue() {
    if (this.queue.length === 0 || this.activeNotifications.length >= this.maxVisible) {
      return;
    }

    const item = this.queue.shift();
    this.showNotification(item);
  }

  animateMove(win, startY, targetY) {
    if (!win || win.isDestroyed()) return;
    const steps = 20;
    const stepDuration = 10; // ~200ms total
    const diff = targetY - startY;
    let currentStep = 0;
    
    if (win.animationInterval) {
        clearInterval(win.animationInterval);
    }
    
    win.animationInterval = setInterval(() => {
      if (!win || win.isDestroyed()) {
        clearInterval(win.animationInterval);
        return;
      }
      currentStep++;
      // Simple ease-out quadratic
      const t = currentStep / steps;
      const easeOut = t * (2 - t);
      const currentY = Math.round(startY + (diff * easeOut));
      const [x, _] = win.getPosition();
      win.setPosition(x, currentY);
      
      if (currentStep >= steps) {
        clearInterval(win.animationInterval);
        win.animationInterval = null;
      }
    }, stepDuration);
  }

  showNotification(item) {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const { x, y } = primaryDisplay.workArea;

    const index = this.activeNotifications.length;
    const winX = x + width - this.width - this.margin;
    const targetY = y + height - ((index + 1) * (this.height + this.margin));
    const startY = targetY + this.height + this.margin; // Start slightly below target

    const win = new BrowserWindow({
      x: winX,
      y: startY,
      width: this.width,
      height: this.height,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      hasShadow: false,
      show: false, // Don't show until ready to slide in
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        preload: path.join(__dirname, 'preloads', 'notification.js')
      }
    });

    win.loadURL(item.iframeUrl);

    win.once('ready-to-show', () => {
      if (!win || win.isDestroyed()) return;
      win.showInactive();
      this.animateMove(win, startY, targetY);
    });

    // We MUST cache the id because win.webContents will be destroyed on close
    const winId = win.webContents.id;

    const timeout = setTimeout(() => {
      this.close(winId);
    }, this.autoCloseMs);

    this.activeNotifications.push({
      id: winId,
      customId: item.id,
      win,
      timeout
    });

    win.on('closed', () => {
      this.activeNotifications = this.activeNotifications.filter(n => n.id !== winId);
      this.recalculatePositions();
      this.processQueue();
    });
  }

  recalculatePositions() {
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const { x, y } = primaryDisplay.workArea;

    const winX = x + width - this.width - this.margin;

    this.activeNotifications.forEach((notification, index) => {
      if (notification.win && !notification.win.isDestroyed()) {
        const targetY = y + height - ((index + 1) * (this.height + this.margin));
        const [currentX, currentY] = notification.win.getPosition();
        if (currentY !== targetY) {
          this.animateMove(notification.win, currentY, targetY);
        }
      }
    });
  }

  close(webContentsId) {
    const notification = this.activeNotifications.find(n => n.id === webContentsId);
    if (notification) {
      if (notification.timeout) clearTimeout(notification.timeout);
      if (notification.win && !notification.win.isDestroyed()) {
        // Option to slide out before closing
        const [x, currentY] = notification.win.getPosition();
        const targetY = currentY + this.height + this.margin;
        this.animateMove(notification.win, currentY, targetY);
        
        // Wait for animation to finish before destroying
        setTimeout(() => {
            if (!notification.win.isDestroyed()) {
                notification.win.close();
            }
        }, 200);
      }
    }
  }

  closeAll() {
    this.queue = [];
    const notifs = [...this.activeNotifications];
    notifs.forEach(n => {
      if (n.timeout) clearTimeout(n.timeout);
      if (n.win && !n.win.isDestroyed()) {
        n.win.close();
      }
    });
    this.activeNotifications = [];
  }
}

module.exports = new NotificationManager();
