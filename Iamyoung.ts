import { Injectable, ViewContainerRef } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, switchMap, tap } from 'rxjs';

import { EnvService } from "@core/services/env.service";
import { AdvancedFilterService } from "@shared/services/advanced-filter.service";
import { BreadcrumbsService, CustomToastrService, UserService } from "@core/services";
import {
    ActivitiesTools,
    AlertDetailsTools,
    ArchivedAlertDetailsTools,
    ArchivedAlertsTools,
} from "app/tools-configs/aggregate-tools-config.constant";
import { BaseAlertDetailsHandlerService } from "@shared/modules/alert-details/models/alert-details-handler-service.model";
import { AlertDetailsHandlerService } from "@shared/modules/alert-details/interfaces/alert-details-handler-service.interface";
import { DataTableService } from "@shared/modules/alert-details/services/datatable.service";
import { CaseAlertDetailsService } from "@shared/modules/alert-details/services/case-alert-details.service";
import { ViewService } from "@shared/modules/alert-details/services/view.service";
import { DispositionFilterService } from "@shared/modules/alert-details/services/disposition-filter.service";
import { AlertTagsComponent } from "@shared/modules/alert-details/components/alert-tags/alert-tags.component";
import { GetCategoryTagTextPipe } from "@shared/pipes/get-category-tag-text.pipe";
import { UserPreferencesService } from "@shared/services/user-prefernces.service";
import { EllipsisService } from "@shared/services/ellipsis.service";
import { PVDataTableService } from "@rxlogix/ui-sdk/datatable";
import { ColumnConfig } from "@shared/modules/alert-details/interfaces/dt-config.interface";
import { AggregateArchivedAlertsColumns } from "app/columns-configs/archived-alerts-columns-config.constant";
import { AggregateActivitiesAlertsColumns } from "app/columns-configs/activities-alerts-columns-config.constant";
import { AggregateHistoryAlertsColumns } from "app/columns-configs/history-alerts-columns-config.constant";
import { AggregateOtherHistoryAlertsColumns } from "app/columns-configs/other-history-alerts-columns-config.constant";

@Injectable()
export class AggregateAlertDetailsHandlerService extends BaseAlertDetailsHandlerService implements AlertDetailsHandlerService {
    private userPref: any;
    private userId?: number;

    constructor(
        protected override datatableService: DataTableService,
        protected override envService: EnvService,
        protected override http: HttpClient,
        protected caseAlertDetailsService: CaseAlertDetailsService,
        protected viewService: ViewService,
        protected override advancedFilterService: AdvancedFilterService,
        protected override dispositionFilterService: DispositionFilterService,
        protected breadcrumbsService: BreadcrumbsService,
        public viewContainerRef: ViewContainerRef,
        public customToastrService: CustomToastrService,
        private userPrefService: UserPreferencesService,
        private userService: UserService,
        private ellipsisService: EllipsisService,
        override dtService: PVDataTableService
    ) {
        super(datatableService, envService, advancedFilterService, http, dispositionFilterService, dtService);
    }

    fetchColumnConfig(): Observable<any> {
        return this.datatableService.getDetailsTableColumns(this.baseUrl + 'aggregateCaseAlertRest/fetchFieldsSpecification', {
            viewId: this.viewId!,
            configId: this.exConfigId!,
            callingScreen: this.callingScreen!,
            isAlertBursting: this.isAlertBursting,
        });
    }

    override buildDtConfig() {
        return {
            ...super.buildDtConfig(),
            autoWidth: false,
            colResize: {
                isEnabled: true,
                saveState: true,
                onResizeEnd: (d: any, col: any) => {
                    if (col.isElipsis) {
                        this.ellipsisService.requestEllipsisRecalculation(col.name);
                    }
                },
                stateLoadCallback: () => this.userPref?.cols,
                stateSaveCallback: (settings: any, data: any) => {
                    const payload = Object.keys(data).reduce(
                        (newObj, key) => {
                            newObj.cols[key] = { width: data[key] };
                            return newObj;
                        },
                        <any>{ cols: {} }
                    );
                    const userId = this.userId!;
                    const viewId = this.viewId!;
                    this.userPrefService.updatePref(userId, viewId, payload).subscribe();
                },
            },
        };
    }

    override buildDtPayload(settings: any) {
        let payload = super.buildDtPayload(settings);

        payload = {
            ...payload,
            isFilterRequest: this.isFilterRequest,
            filters: this.dispositionFilterService.selectedDispositionFilters,
            advancedFilterChanged: this.advancedFilterChanged,
            viewId: this.viewId,
            configId: this.exConfigId,
            cumulative: this.detailsConfig?.cumulative,
            adhocRun: this.detailsConfig?.adhocRun,
            dashboardFilter: this.detailsConfig?.dashboardFilter,
            isArchived: this.detailsConfig?.isArchived,
            isAlertBursting: this.detailsConfig?.isAlertBursting,
            analysisStatusJson: this.detailsConfig?.analysisStatusJson,
            callingScreen: this.detailsConfig?.callingScreen,
            alertType: this.detailsConfig?.alertType,
            isViewInstance: this.currentDraw !== 1 ? '0' : '1',
            tagName: '',
            frequency: '',
        };

        return payload;
    }

    override ajaxCallback(d: any): void {
        if (this.currentDraw === 1 && this.dispositionFilterService.isSessionStoredFilters) this.setIsFilterRequest(true);
        if (this.isMasterConfig && this.productIdList.length) {
            const selectedProductName = d.columns.find((column: any) => column.name === 'productName')?.search.value;
            this.redirectToChildAlert(selectedProductName);
        }
    }

    protected override drawCallback(settings: any): void {
        super.drawCallback(settings);

        setTimeout(() => {
            if (settings.iDraw === 1) this.populateColumnFiltersValues();
        }, 100);
    }

    onComponentInit(): void {
        this.handleRedirectedChildAlert();
    }

    override getDetailsApiUrl(): string {
        return `${this.baseUrl}aggregateCaseAlertRest/listByExecutedConfig`;
    }

    override getDetailsConfig() {
        return this.caseAlertDetailsService
            .getDetailsConfig(this.baseUrl + 'aggregateCaseAlertRest/fetchAlertDetails', {
                callingScreen: this.callingScreen!,
                executedConfigId: this.callingScreen === 'dashboard' && !this.exConfigId ? -1 : this.exConfigId!,
                archived: this.isArchived,
                isAlertBursting: this.isAlertBursting,
                viewId: this.viewId,
            })
            .pipe(
                tap(response => {
                    if (response.data && !response.data?.status) {
                        this.detailsConfig = response.data;
                        this.alertType = this.detailsConfig.alertType;
                        this.viewId = this.detailsConfig.viewId;
                        this.exConfigId = this.detailsConfig.executedConfigId;
                        this.callingScreen = this.detailsConfig.callingScreen;
                    }
                })
            );
    }

    public override afterColumnsFetched(response: any): Observable<any> {
        return this.userService.getCurrentUser().pipe(
            tap(user => (this.userId = user?.id)),
            switchMap(user => this.userPrefService.getPref(this.userId!, this.viewId!)),
            tap(res => (this.userPref = res.data)),
            map(() => response)
        );
    }

    override populateSessionDispositionFilters() {
        const storedDispositionFiltersValue = sessionStorage.getItem('agg_disposition_filters_value');
        const storedRelatedConfigId = sessionStorage.getItem('agg_config_id');
        const isSameConfigId = storedRelatedConfigId && +storedRelatedConfigId === this.exConfigId;

        if (storedDispositionFiltersValue && isSameConfigId) {
            const parsedDispositionFiltersValue = JSON.parse(storedDispositionFiltersValue);
            this.dispositionFilterService.setIsSessionStoredFilters(!!parsedDispositionFiltersValue);
            this.dispositionFilterService.setSelectedDispositionFilters(parsedDispositionFiltersValue ? parsedDispositionFiltersValue : []);
        } else if (!isSameConfigId) {
            sessionStorage.removeItem('agg_disposition_filters_value');
            sessionStorage.setItem('agg_config_id', JSON.stringify(this.exConfigId));
        }
    }

    override getToolsConfig(view?: 'alertDetails' | 'activities' | 'archivedAlerts') {
        const cfg = this.detailsConfig ?? {};
        const fromDashboard = this.callingScreen === 'dashboard';

        let tools = [];

        if (view === 'alertDetails') {
            tools = this.isArchived ? [...ArchivedAlertDetailsTools] : [...AlertDetailsTools];
        } else if (view === 'activities') {
            return [...ActivitiesTools];
        } else if (view === 'archivedAlerts') {
            return [...ArchivedAlertsTools];
        } else {
            return [];
        }

        const toolRemovalConditions: { [key: string]: boolean } = {
            'Save View': !cfg.hasAggReviewerAccess,
            'Data Analysis': fromDashboard || cfg.isJader,
            'Alert Level Disposition': fromDashboard || !cfg.alertDispositionList?.length || !cfg.hasAggReviewerAccess,
            'Alert Review': fromDashboard || !cfg.isAlertLevelReviewEnabled,
            'Generated Report': !cfg.reportUrl,
        };

        tools = tools.filter(tool => !toolRemovalConditions[tool.label]);

        return tools;
    }

    protected override onTableApiResponse(response: any, payload: any, callback: Function): void {
        const dispositionFilters = response && response.filters;

        this.isMasterConfig = response.isMasterConfig;
        this.productNameList = response.productNameList;
        this.productIdList = response.productIdList;
        this.currentProduct = response.currentProduct;
        this.setDssDateRange(response.dssDateRange);

        if (this.isMasterConfig && this.currentProduct && this.isRedirectedChildAlert && this.currentDraw === 1) {
            this.breadcrumbsService.showChildAlertMessage(this.currentProduct);
        }

        if (dispositionFilters) {
            this.dispositionFilterService.setDispositionFiltersOptions({
                filtersList: dispositionFilters,
                advancedFilterDispositionName: response.advancedFilterDispName,
                advancedFilterChanged: this.advancedFilterChanged,
            });
        }

        super.onTableApiResponse(response, payload, callback);
    }

    override getExportConfig(view?: 'alertDetails' | 'activities' | 'archivedAlerts'): {
        includeDetectionSummary: boolean;
        showExportTitle: boolean;
        cumulativeExport: boolean;
        caseForm: boolean;
    } | null {
        if (view === 'alertDetails' && !this.isArchived) {
            return {
                includeDetectionSummary: true,
                showExportTitle: true,
                cumulativeExport: false,
                caseForm: false,
            };
        } else if (view === 'activities') {
            return {
                includeDetectionSummary: false,
                showExportTitle: true,
                cumulativeExport: false,
                caseForm: false,
            };
        }
        return null;
    }

    getArchivedColumns() {
        const columns = AggregateArchivedAlertsColumns;

        if (this.detailsConfig.isAlertLevelReviewEnabled) {
            const stateColumn: any = {
                showDefault: true,
                visible: true,
                title: 'State',
                customTemplate: 'stateColumn',
                ordering: true,
                className: 'col-min-30 state-col',
            };

            columns.push(stateColumn);
        }

        return columns;
    }

    getActivitiesColumns() {
        return AggregateActivitiesAlertsColumns;
    }

    getPanelTabs(): Array<{ view: 'alertDetails' | 'activities' | 'archivedAlerts'; label: string }> {
        const tabs: { view: 'alertDetails' | 'activities' | 'archivedAlerts'; label: string }[] = [
            { view: 'alertDetails', label: 'ALERT DETAILS' },
            { view: 'activities', label: 'ACTIVITIES' },
        ];

        if ((this.callingScreen === 'review' || this.callingScreen !== 'dashboard') && !this.isArchived && this.detailsConfig?.showArchivedAlert) {
            tabs.push({ view: 'archivedAlerts', label: 'ARCHIVED ALERTS' });
        }

        return tabs;
    }

    getHistoryColumns() {
        const columns = AggregateHistoryAlertsColumns;

        const priorityColumn = columns.find(col => col.name === 'priority');
        if (priorityColumn) {
            priorityColumn.visible = this.detailsConfig?.isPriorityEnabled ?? false;
        }

        return columns;
    }

    getOtherHistoryColumns() {
        const columns = AggregateOtherHistoryAlertsColumns;

        const priorityColumn = columns.find(col => col.name === 'priority');
        if (priorityColumn) {
            priorityColumn.visible = this.detailsConfig?.isPriorityEnabled ?? false;
        }

        return columns;
    }

    private formatCategoriesForSearch(categoriesList: any[], key: string) {
        const getCategoryTagTextPipe = new GetCategoryTagTextPipe();
        const textValuesList: string[] = [];
        categoriesList?.forEach(category => {
            textValuesList.push(getCategoryTagTextPipe.transform(category, key));
        });

        return textValuesList;
    }

    public alertName(data: any) {
        if (!data.isAccessibleToCurrentUser) {
            this.customToastrService.showWarning("You don't have access to view this alert");
        } else if (data.isAccessibleToCurrentUser) {
            const alertUrl = data.alertNameUrl.replace(/&amp;/g, '&');
            window.open(alertUrl, '_blank');
        }
    }
}
