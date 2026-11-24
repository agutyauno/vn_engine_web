-- ================================================================
-- VN ENGINE STUDIO - SUPABASE POSTGRESQL SCHEMA (P0 & P1 READY)
-- Tuân thủ: ADR-011, ADR-019, TAD 2.3, TAD 6.1, PRD FR-6.8
-- ================================================================

-- 1. BẢNG PROJECTS (Project Header & Metadata)
-- Ghi chú: projects.version chỉ dùng cho metadata cấp project (tiêu đề, ngôn ngữ...).
-- Conflict check nội dung kịch bản và UI dùng version ở cấp từng resource riêng.
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NULL,
    default_language VARCHAR(10) DEFAULT 'en',
    entry_scene TEXT NULL,
    version INTEGER NOT NULL DEFAULT 1, -- Project metadata version only (ADR-011)
    published_game_id TEXT NULL,
    variables JSONB DEFAULT '[]'::jsonb,
    display_settings JSONB NULL, -- ProjectDisplaySettings
    gameplay_settings JSONB NULL, -- ProjectGameplaySettings
    editor_settings JSONB NULL, -- ProjectEditorSettings
    title_settings JSONB NULL, -- ProjectTitleSettings (asset id cho logo/nền/nhạc Title)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own projects"
    ON public.projects FOR ALL
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- 2. BẢNG SCRIPT_FILES (Từng chương / file kịch bản độc lập)
CREATE TABLE IF NOT EXISTS public.script_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    order_index INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1, -- Optimistic Concurrency Check per file (ADR-011)
    updated_by UUID REFERENCES auth.users(id), -- Track last editor for collaboration (P1)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (project_id, name)
);

ALTER TABLE public.script_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage script files in their projects"
    ON public.script_files FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = script_files.project_id
          AND projects.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = script_files.project_id
          AND projects.owner_id = auth.uid()
    ));

-- 3. BẢNG ASSETS (Metadata tài nguyên media hình ảnh, âm thanh, video, font)
CREATE TABLE IF NOT EXISTS public.assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('image', 'audio', 'video', 'font')),
    category VARCHAR(20) NULL CHECK (category IS NULL OR category IN ('background', 'sprite', 'bgm', 'sfx', 'voice', 'ui', 'other')),
    tag TEXT NULL, -- Nhóm sprite (category = 'sprite'), ví dụ 'alice'
    variant TEXT NULL, -- Biến thể sprite, ví dụ 'happy'
    storage_url TEXT NOT NULL,
    storage_path TEXT NOT NULL,
    size_bytes BIGINT NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1, -- OCC versioning for assets (ADR-011)
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage assets in their projects"
    ON public.assets FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = assets.project_id
          AND projects.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = assets.project_id
          AND projects.owner_id = auth.uid()
    ));

-- Ghi chú kiểm tra ràng buộc xóa Asset (Application Layer):
-- RLS bao quát quyền DELETE, nhưng logic nghiệp vụ "ngăn xóa asset đang được kịch bản tham chiếu"
-- được kiểm tra ở tầng application (Web Studio / Edge Function) trước khi gửi lệnh DELETE.

-- 4. BẢNG UI_CUSTOM_SCREENS (Màn hình giao diện tùy biến)
CREATE TABLE IF NOT EXISTS public.ui_custom_screens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_slot VARCHAR(30) NOT NULL
        CHECK (target_slot IN ('dialogueBox', 'choiceMenu', 'backlog', 'mainMenu', 'settingsMenu', 'saveLoadScreen')),
    template TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1, -- OCC versioning
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.ui_custom_screens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage ui screens in their projects"
    ON public.ui_custom_screens FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = ui_custom_screens.project_id
          AND projects.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = ui_custom_screens.project_id
          AND projects.owner_id = auth.uid()
    ));

-- 5. BẢNG CUSTOM_SCRIPT_SCREENS (Màn hình Custom Script / Minigame P2)
CREATE TABLE IF NOT EXISTS public.custom_script_screens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    script_content TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1, -- OCC versioning
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.custom_script_screens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage custom script screens in their projects"
    ON public.custom_script_screens FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = custom_script_screens.project_id
          AND projects.owner_id = auth.uid()
    ))
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = custom_script_screens.project_id
          AND projects.owner_id = auth.uid()
    ));

-- 6. BẢNG RESOURCE_SNAPSHOTS (Lịch sử phiên bản & Khôi phục - ADR-011, PRD FR-6.8)
CREATE TABLE IF NOT EXISTS public.resource_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    resource_type VARCHAR(20) NOT NULL
        CHECK (resource_type IN ('script_file', 'ui_screen')),
    resource_id UUID NOT NULL,
    content TEXT NOT NULL,
    version INTEGER NOT NULL,
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.resource_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view snapshots of their projects"
    ON public.resource_snapshots FOR ALL
    USING (EXISTS (
        SELECT 1 FROM public.projects
        WHERE projects.id = resource_snapshots.project_id
          AND projects.owner_id = auth.uid()
    ));

-- 7. CHUẨN BỊ CHO P1: COLLABORATION ĐA THÀNH VIÊN (PROJECT_MEMBERS)
-- Khi kích hoạt tính năng làm việc nhóm P1, bảng project_members sẽ được sử dụng
-- và các RLS policy ở trên chỉ cần chuyển điều kiện check qua bảng này:
--
-- CREATE TABLE IF NOT EXISTS public.project_members (
--     project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
--     user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
--     role VARCHAR(10) NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
--     invited_at TIMESTAMPTZ DEFAULT now(),
--     PRIMARY KEY (project_id, user_id)
-- );

-- 8. MIGRATION IDEMPOTENT CHO DATABASE TẠO TỪ BẢN SCHEMA CŨ (TASK-DB-SYNC, 2026-11-24)
-- Chạy lại an toàn nhiều lần. Đồng bộ các cột với AssetRef và ProjectMetadata.
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS category VARCHAR(20) NULL
    CHECK (category IS NULL OR category IN ('background', 'sprite', 'bgm', 'sfx', 'voice', 'ui', 'other'));
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS tag TEXT NULL;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS variant TEXT NULL;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS entry_scene TEXT NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS display_settings JSONB NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS gameplay_settings JSONB NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS editor_settings JSONB NULL;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS title_settings JSONB NULL;

-- Cột projects.characters đã bỏ khỏi contract (bảng characters gỡ ở refactor Unified Sprite).
-- Không tự xoá để tránh mất dữ liệu; nếu database cũ còn cột này, người vận hành tự xoá sau khi sao lưu.
