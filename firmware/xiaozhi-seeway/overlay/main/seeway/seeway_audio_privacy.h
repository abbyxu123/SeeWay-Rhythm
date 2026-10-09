#pragma once
#include <mutex>
#include <utility>

namespace seeway {

// A read holds this lease until capture ends; mute waits for it before closing input.
class AudioInputPrivacy {
public:
    struct ReadLease {
        std::unique_lock<std::mutex> lock;
        bool allowed;
    };

    static ReadLease AcquireRead() {
        std::unique_lock<std::mutex> lock(mutex_);
        return {std::move(lock), !muted_};
    }

    template <class DisableInput>
    static void SetMuted(bool muted, DisableInput disable_input) {
        std::lock_guard<std::mutex> lock(mutex_);
        muted_ = muted;
        if (muted) disable_input();
    }

private:
    inline static std::mutex mutex_;
    inline static bool muted_ = false;
};

}  // namespace seeway
