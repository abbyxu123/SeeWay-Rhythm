#pragma once
class Board {
public:
    static Board& GetInstance() { static Board instance; return instance; }
    bool GetBatteryLevel(int&, bool&, bool&) { return false; }
};
