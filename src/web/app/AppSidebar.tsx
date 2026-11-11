import { THEMES, setTheme, type Theme } from "./data.ts";
import type { View } from "./FilterBar.tsx";
import {
  DarkThemeIcon,
  DashboardIcon,
  Icon,
  InsightsIcon,
  KeyboardIcon,
  LightThemeIcon,
  ReleaseIcon,
  RulesIcon,
  SystemThemeIcon,
  TransactionsIcon,
} from "./icons.ts";
import { CURRENT_RELEASE } from "./Releases.tsx";
import {
  CHECK_ICON,
  RULE_LABEL,
  TAB_GROUPS,
  checkTone,
  type Check,
  type RuleTab,
} from "./ruleMeta.ts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.tsx";
import { Kbd } from "./ui/kbd.tsx";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "./ui/sidebar.tsx";

export const VIEW_LABEL: Record<View, string> = {
  dashboard: "Dashboard",
  transactions: "Transactions",
  insights: "Insights",
  rules: "Rules",
};

const VIEWS: [View, typeof DashboardIcon][] = [
  ["dashboard", DashboardIcon],
  ["transactions", TransactionsIcon],
  ["insights", InsightsIcon],
  ["rules", RulesIcon],
];

const THEME_ICONS = {
  system: SystemThemeIcon,
  light: LightThemeIcon,
  dark: DarkThemeIcon,
};

const title = (s: string) => s[0]!.toUpperCase() + s.slice(1);

interface AppSidebarProps {
  view: View;
  onView: (view: View) => void;
  ruleFile: RuleTab;
  onRuleFile: (file: RuleTab) => void;
  counts: Partial<Record<RuleTab, number>>;
  theme: Theme;
  onTheme: (theme: Theme) => void;
  onHelp: () => void;
  onReleases: () => void;
}

export const AppSidebar = ({
  view,
  onView,
  ruleFile,
  onRuleFile,
  counts,
  theme,
  onTheme,
  onHelp,
  onReleases,
}: AppSidebarProps) => {
  const { isMobile, setOpenMobile } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              onClick={() => {
                onView("dashboard");
                close();
              }}
              tooltip="Spending"
            >
              <img
                src="/icon.svg"
                alt=""
                className="size-8 shrink-0 rounded-lg"
              />
              <span className="grid leading-tight">
                <span className="font-semibold">Spending</span>
                <span className="text-xs text-muted-foreground">
                  SpareBank 1
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Views</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {VIEWS.map(([v, icon], i) => (
                <SidebarMenuItem key={v}>
                  <SidebarMenuButton
                    isActive={view === v}
                    aria-current={view === v ? "page" : undefined}
                    tooltip={VIEW_LABEL[v]}
                    onClick={() => {
                      onView(v);
                      close();
                    }}
                  >
                    <Icon icon={icon} />
                    <span>{VIEW_LABEL[v]}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="max-md:hidden">
                    <Kbd className="bg-transparent">{i + 1}</Kbd>
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {view === "rules" &&
          TAB_GROUPS.map(([label, files]) => (
            <SidebarGroup
              key={label}
              className="group-data-[collapsible=icon]:hidden"
            >
              <SidebarGroupLabel>
                {label === "Checks" ? label : `${label} rules`}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {files.map((f) => {
                    const tone = checkTone(f, counts[f]);
                    return (
                      <SidebarMenuItem key={f}>
                        <SidebarMenuButton
                          size="sm"
                          isActive={ruleFile === f}
                          className={tone}
                          onClick={() => {
                            onRuleFile(f);
                            close();
                          }}
                        >
                          {f in CHECK_ICON && (
                            <Icon icon={CHECK_ICON[f as Check]} />
                          )}
                          <span>{RULE_LABEL[f]}</span>
                        </SidebarMenuButton>
                        {counts[f] !== undefined && (
                          <SidebarMenuBadge
                            className={tone || "text-muted-foreground"}
                          >
                            {counts[f]}
                          </SidebarMenuBadge>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip={`Theme: ${title(theme)}`}>
                  <Icon icon={THEME_ICONS[theme]} />
                  <span>Theme: {title(theme)}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="w-48">
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(v) => {
                    onTheme(v as Theme);
                    setTheme(v as Theme);
                  }}
                >
                  {THEMES.map((t) => (
                    <DropdownMenuRadioItem key={t} value={t}>
                      <Icon icon={THEME_ICONS[t]} />
                      {title(t)}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Keyboard shortcuts"
              onClick={() => {
                close();
                onHelp();
              }}
            >
              <Icon icon={KeyboardIcon} />
              <span>Keyboard shortcuts</span>
            </SidebarMenuButton>
            <SidebarMenuBadge className="max-md:hidden">
              <Kbd className="bg-transparent">?</Kbd>
            </SidebarMenuBadge>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Release notes"
              onClick={() => {
                close();
                onReleases();
              }}
            >
              <Icon icon={ReleaseIcon} />
              <span>
                Version {CURRENT_RELEASE.version}
                <span className="text-muted-foreground"> · Release notes</span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
};
