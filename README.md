# vFDIO

Simulates realworld FAA Flight Data Input Output console that interfaces with VATSIM data as opposed to the National Airspace System. 
Desired functionalities will include a console like GUI for virtual controllers to be able to enter NAS commands (FP, FR, WR, AM, etc.) and be able to return VATSIM data on the display and amend the data.
Once the program is launched, it will automatically assign beacon codes to aircraft within their jurisdiction from an allocated bank. 
It will be hierachy based so by default when a CTR logs on, they will assign all the NAS codes to IFR flightplans originating from that ARTCC's airports. 
If a TRACON below them logs on, they will take over and assign to airports in their jurisdiction, same applies to an ATCT (TWR, GND, DEL)

# vEDST
# vTDLS
