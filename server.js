def verify_license(self):
        key = self.license_entry.get().strip()
        if not key: return
        self.update_status("Authenticating...", "white")

        # 1. Check for Admin Override
        if key == MASTER_ADMIN_KEY:
            self.update_status("Master Key Accepted.", COL_START)
            self.save_valid_key(key)
            self.after(800, lambda: self.launch_main_app(is_trial=False))
            return

        try:
            # 2. Send JSON request to your Render server
            # Ensure SERVER_URL points to your /verify-license endpoint
            response = requests.post(
                SERVER_URL, 
                json={
                    "licenseKey": key, 
                    "hwid": get_hwid() # Sends the unique machine ID
                }, 
                timeout=7
            )
            data = response.json()
            
            # 3. Handle Server Response
            if data.get("success"):
                # Server confirms key exists and HWID matches (or is new)
                self.update_status("Verified.", COL_START)
                self.save_valid_key(key)
                self.after(1000, lambda: self.launch_main_app(is_trial=False))
            else:
                # Server returns "Invalid Key" or "Key in use on another device"
                error_msg = data.get('message', 'Invalid Key')
                self.update_status(f"Error: {error_msg}", COL_STOP)

        except Exception as e:
            # Triggered if Render is down or internet is disconnected
            self.update_status("Connection Failed. Check Internet.", COL_STOP)