self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "DD25 Team Tasks";
  const options = {
    body: data.body || "You have a task update.",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: {
      url: data.url || "/",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => client.url.includes(self.location.origin));

      if (existingClient) {
        existingClient.focus();
        existingClient.navigate(targetUrl);
        return;
      }

      return clients.openWindow(targetUrl);
    })
  );
});
