# StormChaseTracker_Core

After cloning Core, developers must run:

git submodule update --init --recursive


# Xpression Hook info
I am locating the file for providing the reverse geocoded location back to Xpression at \\CALL-xpn-mosgw\C:\XXXXXXXXXX_CG_Payloads\Local_KGAN_Locator\
It's shared via \\CALL-XPN-MOSGW\Local_KGAN_Locator\

Optional Color State:
The VM must have access to \\CALL-xpn-mosgw\C:\XXXXXXXXXX_CG_Payloads\2018_Look (not a validpath, just illuistrating where it needs to be)
I shared it via \\CALL-XPN-MOSGW\2018_Look access it using the Kiosk account info.

This file defines the color state of the graphics and is used to determine the color state of our stuff if needed.

## Web map behind a reverse proxy

The Core map, API, ingest endpoint, and satellite HTTP relay share one listener. Set **Web Map / API Listen Port** in the main Configuration panel, save, and point the reverse proxy at that port. The listener restarts as soon as the setting is saved.

For example, with the Core port set to `8787`, an nginx server can use:

```nginx
location / {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

## Core updates

Core checks the `core` bucket in its configured Versions Directory. Use **Check for Update**, then **Confirm Update** to copy and verify the latest published Core installer, launch it, and close Core. Update installation is always manually confirmed.

